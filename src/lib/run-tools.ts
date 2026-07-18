import { z } from "zod";
import { db } from "@/lib/db-client";
import { toRelative } from "@/lib/paths";
import { renderHtmlToPng } from "@/lib/png-compositor";
import { rankAssets } from "@/lib/asset-ranker";
import type { RunEventType } from "@/generated/prisma/enums";

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

/** Everything a tool needs about the run it belongs to. */
export interface RunToolContext {
  taskRunId: string;
  outDirAbs: string;
  fontFaceCss: string;
  assets: RunToolAsset[];
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
    "Render a self-contained HTML document to a PNG saved in this run's output folder. Use for every final image. The HTML may reference source photos via absolute file:// paths or data URIs.",
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
        const relPath = toRelative(res.absPath);
        await db.runArtifact.create({
          data: {
            taskRunId: ctx.taskRunId,
            kind: "PNG",
            filename: res.filename,
            relPath,
            width: res.width,
            height: res.height,
          },
        });
        await ctx.record("ARTIFACT", {
          filename: res.filename,
          relPath,
          width: res.width,
          height: res.height,
        });
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
];

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
  if (name.endsWith("submit_campaign_plan") && input && typeof input === "object") {
    const items = (input as Record<string, unknown>).items;
    return { items: Array.isArray(items) ? items.length : 0 };
  }
  if (name.endsWith("submit_asset_manifest") && input && typeof input === "object") {
    const requests = (input as Record<string, unknown>).requests;
    return { requests: Array.isArray(requests) ? requests.length : 0 };
  }
  return input;
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
