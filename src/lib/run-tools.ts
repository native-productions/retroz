import path from "node:path";
import { z } from "zod";
import { db } from "@/lib/db-client";
import { storage } from "@/lib/storage";
import { renderHtmlToPng } from "@/lib/png-compositor";
import { rankAssets, deriveKeywords } from "@/lib/asset-ranker";
import { ALLOWED_IMAGE_MIME, storeImage } from "@/lib/asset-store";
import { isPexelsConfigured, searchPexels } from "@/lib/pexels";
import { searchWikimedia } from "@/lib/wikimedia";
import {
  ALLOWED_STOCK_HOSTS,
  isStockSource,
  type StockPhoto,
  type StockSource,
} from "@/lib/stock";
import { formatRenderIssues } from "@/lib/render-guard";
import type { AgentProvider, RunEventType } from "@/generated/prisma/enums";

// The "retroz" tool set exposed to the running agent. Provider-neutral: the
// Claude backend hosts these in-process via the Agent SDK, the Codex backend
// reaches them over the HTTP MCP route (src/app/api/mcp/[token]).

export interface RunToolAsset {
  filename: string;
  absPath: string;
  width: number | null;
  height: number | null;
  description: string;
  tags: string[];
}

/**
 * Where photos the agent fetches mid-run are kept. Null when the run has no
 * library to put them in, which disables the stock tools.
 */
export interface ImportTarget {
  /** Asset rows are created here. */
  folderId: string;
  /** Storage key prefix, e.g. `data/assets/<workflow>/<project>`. */
  relDir: string;
  /** Staged local directory the agent reads the file back from. */
  dirAbs: string;
}

/** Everything a tool needs about the run it belongs to. */
export interface RunToolContext {
  taskRunId: string;
  /** Decides which image-reading tool a result points the agent at. */
  provider: AgentProvider;
  /** Local directory the agent renders into. */
  outDirAbs: string;
  /** Storage key prefix those outputs are persisted under. */
  outPrefix: string;
  /**
   * Run-local directory web captures are written to. Never published — only
   * `outDirAbs` is uploaded when the workspace closes. Null when the run has no
   * browsing enabled, which disables the browse tools.
   */
  webDirAbs: string | null;
  fontFaceCss: string;
  assets: RunToolAsset[];
  importTarget: ImportTarget | null;
  record: (type: RunEventType, payload: unknown) => Promise<void>;
}

/** MCP-shaped tool result — the same JSON works for the SDK and the HTTP route. */
export interface RunToolResult {
  // Index signature keeps this assignable to the Agent SDK's CallToolResult.
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/**
 * A run tool, generic over the context it needs. Render tools use
 * RunToolContext; the planner uses PlannerToolContext. The backends never
 * introspect the context — they just hand it to execute — so one primitive
 * serves every tool set.
 */
export interface ToolDef<Ctx> {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  execute: (ctx: Ctx, args: unknown) => Promise<RunToolResult>;
}

/** Back-compat alias — the render tool set. */
export type RunToolDef = ToolDef<RunToolContext>;

export function text(value: string, isError?: boolean): RunToolResult {
  return { content: [{ type: "text", text: value }], ...(isError ? { isError } : {}) };
}

export function defineTool<Ctx, Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: Shape,
  execute: (ctx: Ctx, args: z.output<z.ZodObject<Shape>>) => Promise<RunToolResult>,
): ToolDef<Ctx> {
  return {
    name,
    description,
    shape,
    execute: execute as ToolDef<Ctx>["execute"],
  };
}

function defineRunTool<Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: Shape,
  execute: (
    ctx: RunToolContext,
    args: z.output<z.ZodObject<Shape>>,
  ) => Promise<RunToolResult>,
): RunToolDef {
  return defineTool<RunToolContext, Shape>(name, description, shape, execute);
}

export const RUN_TOOLS: RunToolDef[] = [
  defineRunTool(
    "render_html_to_png",
    "Render a self-contained HTML document to a PNG saved in this run's output folder. Use for every final image. The HTML may reference source photos via absolute file:// paths or data URIs. The rendered page is AUDITED before it is accepted: the call FAILS when content overflows the frame, text is clipped, an image did not load, an element renders invisible, or text overlaps an icon. On failure, fix the HTML and call this again with the SAME filename.",
    {
      html: z.string().describe("Complete self-contained HTML document."),
      filename: z.string().describe("Output filename, e.g. '01-hook.png'."),
      width: z.number().int().min(64).max(4096).default(1080),
      height: z.number().int().min(64).max(4096).default(1080),
    },
    async (ctx, args) => {
      try {
        const res = await renderHtmlToPng({
          html: args.html,
          outDir: ctx.outDirAbs,
          filename: args.filename,
          width: args.width,
          height: args.height,
          fontFaceCss: ctx.fontFaceCss,
        });
        // Persist immediately rather than syncing at the end of the run, so the
        // run viewer can show each image the moment it is produced.
        const relPath = `${ctx.outPrefix}/${res.filename}`;
        await storage.put(relPath, res.buffer, { contentType: "image/png" });
        const artifact = await db.runArtifact.create({
          data: {
            taskRunId: ctx.taskRunId,
            kind: "PNG",
            filename: res.filename,
            relPath,
            width: res.width,
            height: res.height,
            bytes: res.buffer.byteLength,
          },
          select: { id: true },
        });
        await keepRenderSource(artifact.id, res.filename, args);
        // The row id travels with the event so a live viewer can act on the
        // render (bundle it, for instance) before the page ever refreshes.
        await ctx.record("ARTIFACT", {
          id: artifact.id,
          filename: res.filename,
          relPath,
          width: res.width,
          height: res.height,
          ...(res.issues.length > 0
            ? { issues: res.issues.map((i) => i.kind) }
            : {}),
        });

        if (res.issues.length > 0) {
          // The PNG is kept deliberately: the agent needs to see what it got
          // wrong, and the run viewer should show the broken frame rather than a
          // gap. The failure is what forces the correction.
          const viewTool = ctx.provider === "CODEX" ? "view_image" : "Read";
          return text(
            [
              `REJECTED ${res.filename} — the rendered frame is broken:`,
              formatRenderIssues(res.issues),
              "",
              `The PNG was still written to ${res.absPath}. Use the "${viewTool}" tool on that path to see the damage, then fix the HTML and call render_html_to_png again with the SAME filename "${res.filename}" to replace it.`,
              "Fix the layout — do not hide the problem with overflow:hidden, and do not move on to the next image until this one renders clean.",
            ].join("\n"),
            true,
          );
        }
        return text(`Saved ${res.filename} (${res.width}x${res.height}).`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return text(`Render failed: ${msg}`, true);
      }
    },
  ),
  defineRunTool(
    "list_assets",
    "List ALL source photos for this task with their descriptions, tags, and absolute paths. Use search_assets instead when the folder is large and you only need the ones relevant to the current content.",
    {},
    async (ctx) =>
      text(
        ctx.assets.length === 0
          ? "No source assets."
          : ctx.assets.map(formatAssetLine).join("\n"),
      ),
  ),
  defineRunTool(
    "search_assets",
    "Find the source photos most relevant to a description without loading any images. Returns ranked filenames, absolute paths, descriptions, and tags — read only the finalists you actually intend to use. Prefer this over list_assets for large folders.",
    {
      query: z
        .string()
        .describe("What you are looking for, e.g. 'sunset beach vertical warm tones'."),
      limit: z.number().int().min(1).max(50).default(10),
    },
    async (ctx, args) => {
      const ranked = rankAssets(args.query, ctx.assets, args.limit);
      return text(
        ranked.length === 0
          ? "No source assets."
          : ranked.map(formatAssetLine).join("\n"),
      );
    },
  ),
  defineRunTool(
    "search_stock",
    "Search Wikimedia Commons and Pexels for a freely-licensed photo when nothing in the asset library fits. Returns candidates with their captions, dimensions, licence and URL — nothing is downloaded. Call search_assets FIRST; only reach for this when the library has no usable photo. Pass the chosen candidates to import_stock to actually use them.",
    {
      query: z
        .string()
        .describe("What the image should show, e.g. 'lighthouse on a cliff at dusk'."),
      source: z
        .enum(["any", "wikimedia", "pexels"])
        .default("any")
        .describe(
          "Wikimedia leans documentary and factual (logos, landmarks, people, objects); Pexels leans stock-photography mood shots.",
        ),
      limit: z.number().int().min(1).max(20).default(8),
    },
    async (ctx, args) => {
      if (!ctx.importTarget) {
        return text(
          "This run has no asset library to import into, so stock search is unavailable. Work with the assets you were given.",
          true,
        );
      }

      const wanted: StockSource[] =
        args.source === "any" ? ["wikimedia", "pexels"] : [args.source];
      const notes: string[] = [];
      const found: StockPhoto[] = [];

      for (const source of wanted) {
        if (source === "pexels" && !(await isPexelsConfigured())) {
          notes.push("Pexels is not configured (no API key in Settings).");
          continue;
        }
        try {
          const result =
            source === "pexels"
              ? await searchPexels(args.query, 1, args.limit)
              : await searchWikimedia(args.query, 1, args.limit);
          found.push(...result.photos);
        } catch (err) {
          notes.push(
            `${source} search failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Interleave the sources so one provider cannot crowd the other out.
      const usable = found
        .filter((p) => !p.mime || ALLOWED_IMAGE_MIME.has(p.mime))
        .slice(0, args.limit * wanted.length);

      if (usable.length === 0) {
        return text(
          [`No usable photos for "${args.query}".`, ...notes].join("\n"),
        );
      }

      return text(
        [
          ...usable.map(
            (p) =>
              `${p.source}:${p.id} :: ${p.width}x${p.height} :: ${p.alt || "(no caption)"}` +
              ` :: ${p.attribution || "(no attribution)"} :: ${p.full}`,
          ),
          ...notes,
          "",
          "To use any of these, call import_stock with their id, source and url.",
        ].join("\n"),
      );
    },
  ),
  defineRunTool(
    "import_stock",
    "Download photos returned by search_stock into this project's asset library and get back absolute paths you can reference from HTML. Import only the ones you will actually place — each becomes a permanent, user-visible asset.",
    {
      photos: z
        .array(
          z.object({
            id: z.string().describe("Provider id exactly as search_stock returned it."),
            source: z.enum(["wikimedia", "pexels"]),
            url: z.string().describe("The URL from search_stock, unmodified."),
            alt: z.string().default("").describe("Caption from search_stock."),
            attribution: z.string().default(""),
          }),
        )
        .min(1)
        .max(6),
    },
    async (ctx, args) => {
      const target = ctx.importTarget;
      if (!target) {
        return text("This run has no asset library to import into.", true);
      }

      const lines: string[] = [];
      for (const photo of args.photos) {
        if (!isStockSource(photo.source)) {
          lines.push(`${photo.id}: unknown source`);
          continue;
        }
        const sourceRef = `${photo.source}:${photo.id}`;

        // Already in the library — reuse it rather than paying for it twice.
        const existing = await db.asset.findFirst({
          where: { folderId: target.folderId, sourceRef },
        });
        if (existing) {
          const abs = await storage.hydrate(
            existing.relPath,
            path.join(target.dirAbs, existing.filename),
          );
          lines.push(`${sourceRef} :: ${abs} :: already in the library`);
          continue;
        }

        // Same SSRF guard as the human-facing import route: a URL the model
        // invented can only ever point at the provider's own image CDN.
        let host = "";
        try {
          host = new URL(photo.url).hostname;
        } catch {
          lines.push(`${sourceRef}: malformed URL`);
          continue;
        }
        if (!ALLOWED_STOCK_HOSTS[photo.source].includes(host)) {
          lines.push(`${sourceRef}: ${host} is not an allowed ${photo.source} host`);
          continue;
        }

        try {
          const res = await fetchStock(photo.url);
          if (!res.ok) {
            lines.push(`${sourceRef}: download failed (HTTP ${res.status})`);
            continue;
          }
          const contentType = (res.headers.get("content-type") ?? "")
            .split(";")[0]
            .trim();
          const mime = ALLOWED_IMAGE_MIME.has(contentType)
            ? contentType
            : "image/jpeg";
          const buf = Buffer.from(await res.arrayBuffer());
          const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";

          const stored = await storeImage(target.relDir, {
            buf,
            mimeType: mime,
            name: `${photo.source}-${photo.id}.${ext}`,
          });

          const description = [photo.alt.trim(), photo.attribution.trim()]
            .filter(Boolean)
            .join(" — ");
          await db.asset.create({
            data: {
              folderId: target.folderId,
              filename: stored.filename,
              relPath: stored.relPath,
              mimeType: mime,
              size: stored.size,
              width: stored.width,
              height: stored.height,
              description,
              // Tags come from the caption only, never the licence string.
              tags: deriveKeywords(photo.alt),
              autoDescribed: true,
              sourceRef,
            },
          });

          const abs = await storage.hydrate(
            stored.relPath,
            path.join(target.dirAbs, stored.filename),
          );
          // Make it findable by search_assets for the rest of this run.
          ctx.assets.push({
            filename: stored.filename,
            absPath: abs,
            width: stored.width,
            height: stored.height,
            description,
            tags: deriveKeywords(photo.alt),
          });
          await ctx.record("TOOL", {
            name: "import_stock",
            sourceRef,
            filename: stored.filename,
          });

          lines.push(
            `${sourceRef} :: ${abs} :: ${stored.width}x${stored.height} :: imported`,
          );
        } catch (err) {
          lines.push(
            `${sourceRef}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      return text(lines.join("\n"));
    },
  ),
];

/** Wikimedia's API policy requires a descriptive User-Agent; Pexels tolerates it. */
const STOCK_USER_AGENT = "Retroz/1.0 (local content assistant)";

/**
 * Download a stock image, retrying once on 429.
 *
 * Commons renders thumbnails on demand and rate-limits that generation, so the
 * first request for an uncached size often 429s while still queueing the render.
 * A short pause and one retry usually lands it; anything past that is a real
 * limit and the caller reports it.
 */
async function fetchStock(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": STOCK_USER_AGENT } });
  if (res.status !== 429) return res;

  const retryAfter = Number(res.headers.get("retry-after"));
  const waitMs = Math.min(
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500,
    5000,
  );
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return fetch(url, { headers: { "User-Agent": STOCK_USER_AGENT } });
}

/**
 * A document past this is almost certainly carrying base64 photo payloads. The
 * PNG is already stored, so the only thing lost by skipping one is the ability
 * to revise it later — worth trading against parking megabytes per slide in
 * Postgres forever.
 */
const MAX_KEPT_HTML_BYTES = 4_000_000;

/**
 * Keep the source document alongside the render so a revision months later has
 * something to edit. Never fails the render: the image exists either way, and
 * losing the source is a smaller problem than losing the run.
 */
async function keepRenderSource(
  artifactId: string,
  filename: string,
  args: { html: string; width: number; height: number },
): Promise<void> {
  const bytes = Buffer.byteLength(args.html, "utf8");
  // Both branches below are logged: a render that quietly has no source looks
  // fine today and only surfaces months later, as "I cannot revise this".
  if (bytes > MAX_KEPT_HTML_BYTES) {
    console.warn(
      `[retroz] ${filename}: HTML source not kept (${bytes} bytes exceeds the ` +
        `${MAX_KEPT_HTML_BYTES} limit) — this render will not be revisable. ` +
        "Reference photos by file:// path instead of embedding data URIs.",
    );
    return;
  }
  try {
    await db.renderSource.create({
      data: {
        artifactId,
        html: args.html,
        width: args.width,
        height: args.height,
      },
    });
  } catch (err) {
    // Storing the source is best-effort — the render already succeeded.
    console.warn(
      `[retroz] ${filename}: HTML source not stored — this render will not be ` +
        `revisable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function formatAssetLine(a: RunToolAsset): string {
  const tags = a.tags.length > 0 ? ` :: tags: ${a.tags.join(", ")}` : "";
  return `${a.filename} :: ${a.absPath} :: ${a.description || "(no description)"}${tags}`;
}

/** Compact TOOL-event payload; drops multi-KB HTML bodies from the run log. */
export function summarizeToolInput(name: string, input: unknown): unknown {
  if (name.endsWith("render_html_to_png") && input && typeof input === "object") {
    const i = input as Record<string, unknown>;
    return {
      filename: i.filename,
      width: i.width,
      height: i.height,
      htmlBytes: typeof i.html === "string" ? i.html.length : 0,
    };
  }
  // Work's plan panel reads these back, so keep the todos but drop anything
  // else the engine attaches.
  if (name.endsWith("TodoWrite") && input && typeof input === "object") {
    const todos = (input as Record<string, unknown>).todos;
    return {
      todos: Array.isArray(todos)
        ? todos.map((t) => {
            const todo = (t ?? {}) as Record<string, unknown>;
            return {
              content: todo.content,
              status: todo.status,
              activeForm: todo.activeForm,
            };
          })
        : [],
    };
  }
  if (name.endsWith("submit_campaign_plan") && input && typeof input === "object") {
    const items = (input as Record<string, unknown>).items;
    return { items: Array.isArray(items) ? items.length : 0 };
  }
  // Keep the provider handles, drop the CDN URLs — they are multi-hundred-char
  // and the run log is replayed into the conversation view.
  if (name.endsWith("import_stock") && input && typeof input === "object") {
    const photos = (input as Record<string, unknown>).photos;
    return {
      photos: Array.isArray(photos)
        ? photos.map((p) => {
            const photo = (p ?? {}) as Record<string, unknown>;
            return `${photo.source}:${photo.id}`;
          })
        : [],
    };
  }
  if (name.endsWith("submit_asset_manifest") && input && typeof input === "object") {
    const requests = (input as Record<string, unknown>).requests;
    return { requests: Array.isArray(requests) ? requests.length : 0 };
  }
  // The query is the whole story for a search; the tuning knobs are noise.
  if (name.endsWith("web_search") && input && typeof input === "object") {
    const i = input as Record<string, unknown>;
    return { query: i.query, ...(i.topic === "news" ? { topic: "news" } : {}) };
  }
  // One page, so the host alone is the useful part; the full URL is long and the
  // run log is replayed into the conversation view.
  if (name.endsWith("read_web_page") && input && typeof input === "object") {
    const url = (input as Record<string, unknown>).url;
    return { source: hostOf(String(url)) };
  }
  // Show which sites were read, not the URLs — they are long and the run log is
  // replayed into the conversation view.
  if (name.endsWith("web_extract") && input && typeof input === "object") {
    const urls = (input as Record<string, unknown>).urls;
    return {
      sources: Array.isArray(urls) ? urls.map((u) => hostOf(String(u))) : [],
    };
  }
  return input;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Live context registry — lets the HTTP MCP route resolve a run's context from
// an unguessable per-run token. Survives HMR via global, like run-queue.
// ---------------------------------------------------------------------------

/** A token-scoped MCP entry: the run's context plus the tool set it exposes. */
export interface ToolEntry {
  ctx: unknown;
  tools: ToolDef<unknown>[];
}

const globalForContexts = globalThis as unknown as {
  runToolContexts?: Map<string, ToolEntry>;
};

function contexts(): Map<string, ToolEntry> {
  if (!globalForContexts.runToolContexts) {
    globalForContexts.runToolContexts = new Map();
  }
  return globalForContexts.runToolContexts;
}

/**
 * Register a run's tool context + its tool set; returns the token for its MCP
 * URL. The tool set travels with the token so the HTTP MCP route serves the
 * right tools per run (render tools for a render run, planner tools for a
 * planner run) without importing any tool set statically.
 */
export function registerToolContext<Ctx>(
  ctx: Ctx,
  tools: ToolDef<Ctx>[],
): string {
  const token = crypto.randomUUID();
  contexts().set(token, {
    ctx,
    tools: tools as unknown as ToolDef<unknown>[],
  });
  return token;
}

export function getToolEntry(token: string): ToolEntry | undefined {
  return contexts().get(token);
}

export function releaseToolContext(token: string): void {
  contexts().delete(token);
}

// --- back-compat wrappers (render path) ---

/** Register a render run's tool context (RUN_TOOLS). */
export function registerRunToolContext(ctx: RunToolContext): string {
  return registerToolContext(ctx, RUN_TOOLS);
}

export function getRunToolContext(token: string): RunToolContext | undefined {
  return contexts().get(token)?.ctx as RunToolContext | undefined;
}

export function releaseRunToolContext(token: string): void {
  releaseToolContext(token);
}
