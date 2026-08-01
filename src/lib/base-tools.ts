import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import sharp from "sharp";

/**
 * The built-in filesystem tools for the OPENAI_COMPAT engine.
 *
 * Claude Code and the Codex CLI ship these — `DEFAULT_BASE_TOOLS` in
 * claude-backend.ts and `WORK_BASE_TOOLS` in work-executor.ts are only *names*
 * handed to the SDK's allowlist. A raw model API has no such thing, so the same
 * capabilities are implemented here.
 *
 * These are deliberately NOT `RunToolDef`s: `RunToolResult` is text-only so it
 * stays assignable to the Agent SDK's `CallToolResult`, and `view_image` has to
 * return image content. Only the OpenAI-compatible backend consumes this module.
 */

export type BaseToolContent =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string };

export interface BaseToolResult {
  content: BaseToolContent[];
  isError?: boolean;
}

export interface BaseToolContext {
  /** The run's working directory — relative paths resolve against it. */
  cwd: string;
  /**
   * Every directory this run may touch (cwd plus the executor's
   * additionalDirectories). Anything outside is refused: the Claude and Codex
   * backends run unsandboxed, but this backend is our own code and draws the
   * line itself.
   */
  allowedDirs: string[];
}

export interface BaseToolDef {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  execute: (ctx: BaseToolContext, args: never) => Promise<BaseToolResult>;
}

const MAX_READ_BYTES = 400_000;
const MAX_OUTPUT_CHARS = 30_000;
const MAX_GLOB_RESULTS = 200;
const MAX_GREP_RESULTS = 200;
const DEFAULT_BASH_TIMEOUT_MS = 120_000;
const MAX_BASH_TIMEOUT_MS = 600_000;
/** Longest edge an image is downscaled to before it becomes base64 in context. */
const MAX_IMAGE_EDGE = 1568;

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
]);

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build"]);

function text(value: string, isError?: boolean): BaseToolResult {
  return { content: [{ type: "text", text: value }], ...(isError ? { isError } : {}) };
}

function truncate(value: string, limit = MAX_OUTPUT_CHARS): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n… [truncated, ${value.length - limit} more characters]`;
}

function defineBaseTool<Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: Shape,
  execute: (
    ctx: BaseToolContext,
    args: z.output<z.ZodObject<Shape>>,
  ) => Promise<BaseToolResult>,
): BaseToolDef {
  return { name, description, shape, execute: execute as BaseToolDef["execute"] };
}

/**
 * Resolve a path against the run's cwd and confirm it lands inside an allowed
 * directory. Returns null when it escapes, which every tool reports as an error
 * result rather than throwing — a refused path should cost the agent one turn,
 * not the whole run.
 */
function resolveInside(ctx: BaseToolContext, input: string): string | null {
  const abs = path.resolve(ctx.cwd, input);
  const allowed = ctx.allowedDirs.some((dir) => {
    const rel = path.relative(path.resolve(dir), abs);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
  return allowed ? abs : null;
}

function outsideError(ctx: BaseToolContext, input: string): BaseToolResult {
  return text(
    `Refused: "${input}" is outside this run's directories.\nAllowed: ${ctx.allowedDirs.join(", ")}`,
    true,
  );
}

/** Translate a glob pattern into a RegExp. Supports **, *, ? and {a,b}. */
function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        // `**/` crosses directories, and so does a trailing `**`.
        if (pattern[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else if (char === "{") {
      const close = pattern.indexOf("}", i);
      if (close === -1) {
        out += "\\{";
      } else {
        const alts = pattern
          .slice(i + 1, close)
          .split(",")
          .map((a) => a.replace(/[.+^${}()|[\]\\]/g, "\\$&"));
        out += `(?:${alts.join("|")})`;
        i = close;
      }
    } else if (".+^$()|[]\\".includes(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  return new RegExp(`^${out}$`);
}

/** Depth-first file listing, skipping the usual dependency and build folders. */
async function walk(dir: string, root: string, out: string[]): Promise<void> {
  if (out.length >= MAX_GLOB_RESULTS * 5) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      await walk(abs, root, out);
    } else if (entry.isFile()) {
      out.push(path.relative(root, abs));
    }
  }
}

// --- tools -----------------------------------------------------------------

const readTool = defineBaseTool(
  "Read",
  "Read a text file from disk. Returns the contents with line numbers. For images use view_image instead.",
  {
    file_path: z.string().describe("Absolute path, or relative to the run folder."),
    offset: z.number().int().min(1).optional().describe("First line to read (1-based)."),
    limit: z.number().int().min(1).optional().describe("How many lines to read."),
  },
  async (ctx, args) => {
    const abs = resolveInside(ctx, args.file_path);
    if (!abs) return outsideError(ctx, args.file_path);

    if (IMAGE_EXTENSIONS.has(path.extname(abs).toLowerCase())) {
      return text(
        `"${path.basename(abs)}" is an image. Use the view_image tool on this path to look at it.`,
        true,
      );
    }

    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      return text(`File not found: ${abs}`, true);
    }
    if (stat.isDirectory()) {
      const entries = await fs.readdir(abs);
      return text(`${abs} is a directory. Entries:\n${entries.join("\n")}`, true);
    }
    if (stat.size > MAX_READ_BYTES) {
      return text(
        `File is ${stat.size} bytes, over the ${MAX_READ_BYTES} limit. Read it in slices with offset/limit.`,
        true,
      );
    }

    const raw = await fs.readFile(abs, "utf8");
    const lines = raw.split("\n");
    const start = (args.offset ?? 1) - 1;
    const end = args.limit ? start + args.limit : lines.length;
    const slice = lines.slice(start, end);
    const width = String(start + slice.length).length;
    const numbered = slice
      .map((line, i) => `${String(start + i + 1).padStart(width, " ")}\t${line}`)
      .join("\n");
    return text(truncate(numbered));
  },
);

const writeTool = defineBaseTool(
  "Write",
  "Write a file to disk, creating parent folders and overwriting any existing file.",
  {
    file_path: z.string().describe("Absolute path, or relative to the run folder."),
    content: z.string().describe("The complete file contents."),
  },
  async (ctx, args) => {
    const abs = resolveInside(ctx, args.file_path);
    if (!abs) return outsideError(ctx, args.file_path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, args.content, "utf8");
    return text(`Wrote ${Buffer.byteLength(args.content)} bytes to ${abs}`);
  },
);

const globTool = defineBaseTool(
  "Glob",
  "Find files by glob pattern (supports **, *, ? and {a,b}). Returns paths relative to the search root.",
  {
    pattern: z.string().describe("Glob pattern, e.g. '**/*.html'."),
    path: z.string().optional().describe("Directory to search. Defaults to the run folder."),
  },
  async (ctx, args) => {
    const root = resolveInside(ctx, args.path ?? ".");
    if (!root) return outsideError(ctx, args.path ?? ".");

    const files: string[] = [];
    await walk(root, root, files);
    const re = globToRegExp(args.pattern);
    const matches = files.filter((f) => re.test(f)).slice(0, MAX_GLOB_RESULTS);
    if (matches.length === 0) return text(`No files match ${args.pattern} under ${root}`);
    return text(matches.join("\n"));
  },
);

const grepTool = defineBaseTool(
  "Grep",
  "Search file contents with a regular expression. Returns 'path:line: match' rows.",
  {
    pattern: z.string().describe("Regular expression to search for."),
    path: z.string().optional().describe("Directory to search. Defaults to the run folder."),
    glob: z.string().optional().describe("Only search files matching this glob."),
    case_insensitive: z.boolean().default(false),
  },
  async (ctx, args) => {
    const root = resolveInside(ctx, args.path ?? ".");
    if (!root) return outsideError(ctx, args.path ?? ".");

    let re: RegExp;
    try {
      re = new RegExp(args.pattern, args.case_insensitive ? "i" : "");
    } catch (err) {
      return text(`Invalid regular expression: ${(err as Error).message}`, true);
    }

    const files: string[] = [];
    await walk(root, root, files);
    const fileFilter = args.glob ? globToRegExp(args.glob) : null;
    const hits: string[] = [];

    for (const rel of files) {
      if (fileFilter && !fileFilter.test(rel)) continue;
      if (IMAGE_EXTENSIONS.has(path.extname(rel).toLowerCase())) continue;
      let contents: string;
      try {
        contents = await fs.readFile(path.join(root, rel), "utf8");
      } catch {
        continue;
      }
      const lines = contents.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 300)}`);
          if (hits.length >= MAX_GREP_RESULTS) break;
        }
      }
      if (hits.length >= MAX_GREP_RESULTS) break;
    }

    if (hits.length === 0) return text(`No matches for ${args.pattern} under ${root}`);
    return text(truncate(hits.join("\n")));
  },
);

const bashTool = defineBaseTool(
  "Bash",
  "Run a shell command in the run folder. Returns combined stdout and stderr plus the exit code.",
  {
    command: z.string().describe("The shell command to run."),
    timeout: z
      .number()
      .int()
      .min(1000)
      .max(MAX_BASH_TIMEOUT_MS)
      .optional()
      .describe("Timeout in milliseconds. Defaults to 120000."),
  },
  async (ctx, args) => {
    const timeoutMs = args.timeout ?? DEFAULT_BASH_TIMEOUT_MS;
    return new Promise<BaseToolResult>((resolve) => {
      const child = spawn("/bin/sh", ["-c", args.command], {
        cwd: ctx.cwd,
        env: process.env,
      });

      let output = "";
      const append = (chunk: Buffer) => {
        if (output.length < MAX_OUTPUT_CHARS * 2) output += chunk.toString();
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve(
          text(
            `Command timed out after ${timeoutMs}ms.\n${truncate(output)}`,
            true,
          ),
        );
      }, timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve(text(`Failed to start command: ${err.message}`, true));
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const body = truncate(output.trim() || "(no output)");
        resolve(
          code === 0
            ? text(body)
            : text(`Exit code ${code}\n${body}`, true),
        );
      });
    });
  },
);

const todoWriteTool = defineBaseTool(
  "TodoWrite",
  "Record your plan for this run as a todo list. Call it again whenever a step starts or finishes so the user can follow along.",
  {
    todos: z
      .array(
        z.object({
          content: z.string().describe("What the step does."),
          status: z.enum(["pending", "in_progress", "completed"]),
          activeForm: z
            .string()
            .optional()
            .describe("Present continuous form, e.g. 'Rendering the hook slide'."),
        }),
      )
      .describe("The full list, every call — not just the changed entries."),
  },
  // The plan panel is fed by the TOOL run-event the backend emits from the tool
  // call itself (see summarizeToolInput in run-tools.ts), so there is no state
  // to keep here. The acknowledgement just closes the tool call.
  async (_ctx, args) => text(`Plan updated (${args.todos.length} steps).`),
);

const viewImageTool = defineBaseTool(
  "view_image",
  "Look at an image file. Use this on every source photo before designing an overlay for it, and on a rendered PNG to check the result.",
  {
    path: z.string().describe("Absolute path, or relative to the run folder."),
  },
  async (ctx, args) => {
    const abs = resolveInside(ctx, args.path);
    if (!abs) return outsideError(ctx, args.path);
    if (!IMAGE_EXTENSIONS.has(path.extname(abs).toLowerCase())) {
      return text(`${abs} is not an image file.`, true);
    }

    try {
      // Full-size renders are 2× retina and would cost thousands of tokens as
      // base64. Downscale to something the model can still read type from.
      const pipeline = sharp(abs).rotate();
      const meta = await pipeline.metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      const resized =
        longest > MAX_IMAGE_EDGE
          ? pipeline.resize({
              width: (meta.width ?? 0) >= (meta.height ?? 0) ? MAX_IMAGE_EDGE : undefined,
              height: (meta.height ?? 0) > (meta.width ?? 0) ? MAX_IMAGE_EDGE : undefined,
              fit: "inside",
            })
          : pipeline;
      const buffer = await resized.png().toBuffer();
      return {
        content: [
          {
            type: "text",
            text: `${path.basename(abs)} — ${meta.width}×${meta.height}px`,
          },
          { type: "image", mediaType: "image/png", data: buffer.toString("base64") },
        ],
      };
    } catch (err) {
      return text(`Could not read image: ${(err as Error).message}`, true);
    }
  },
);

/** Every built-in, keyed by the name the executors use in their baseTools list. */
export const BASE_TOOLS: Record<string, BaseToolDef> = {
  Read: readTool,
  Write: writeTool,
  Glob: globTool,
  Grep: grepTool,
  Bash: bashTool,
  TodoWrite: todoWriteTool,
  view_image: viewImageTool,
};

/**
 * Pick the built-ins for one run. `names` is the executor's baseTools list
 * (`["Read"]` for the planner, `WORK_BASE_TOOLS` for Work, the render default
 * otherwise). `view_image` is appended only when the model can actually see —
 * offering it to a text-only model wastes a turn on a call that cannot help.
 */
export function selectBaseTools(
  names: string[],
  options: { vision: boolean },
): BaseToolDef[] {
  const selected = names
    .map((name) => BASE_TOOLS[name])
    .filter((tool): tool is BaseToolDef => Boolean(tool));
  if (options.vision && !names.includes("view_image")) {
    selected.push(viewImageTool);
  }
  return selected;
}
