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

export interface RunToolDef {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  execute: (ctx: RunToolContext, args: unknown) => Promise<RunToolResult>;
}

function text(value: string, isError?: boolean): RunToolResult {
  return { content: [{ type: "text", text: value }], ...(isError ? { isError } : {}) };
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
  return {
    name,
    description,
    shape,
    execute: execute as RunToolDef["execute"],
  };
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
  return input;
}

// ---------------------------------------------------------------------------
// Live context registry — lets the HTTP MCP route resolve a run's context from
// an unguessable per-run token. Survives HMR via global, like run-queue.
// ---------------------------------------------------------------------------

const globalForContexts = globalThis as unknown as {
  runToolContexts?: Map<string, RunToolContext>;
};

function contexts(): Map<string, RunToolContext> {
  if (!globalForContexts.runToolContexts) {
    globalForContexts.runToolContexts = new Map();
  }
  return globalForContexts.runToolContexts;
}

/** Register a run's tool context; returns the token for its MCP URL. */
export function registerRunToolContext(ctx: RunToolContext): string {
  const token = crypto.randomUUID();
  contexts().set(token, ctx);
  return token;
}

export function getRunToolContext(token: string): RunToolContext | undefined {
  return contexts().get(token);
}

export function releaseRunToolContext(token: string): void {
  contexts().delete(token);
}
