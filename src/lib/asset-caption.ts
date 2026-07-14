import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/lib/db-client";
import { runOnClaudeQueue } from "@/lib/run-queue";

// Auto-caption assistant. Turns a source photo into a short description + tags so
// the asset ranker can match it to a run's instruction without ever loading the
// image again. Runs on the cheap Haiku tier, through the shared Claude queue, and
// respects the app's auth mode (no API key under SUBSCRIPTION).
//
// This produces a PREVIEW only — the caller shows it to the user for confirmation
// before anything is written to the asset.

export interface CaptionSuggestion {
  id: string;
  description: string;
  tags: string[];
  error?: string;
}

const CAPTION_MODEL = "haiku";

function buildEnv(stripApiKey: boolean): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") env[k] = v;
  }
  // Subscription login: the CLI must use the local session, not an API key.
  if (stripApiKey) delete env.ANTHROPIC_API_KEY;
  return env;
}

function captionPrompt(absPath: string): string {
  return `Read the image at ${absPath} using the Read tool, then describe it for a content-asset search index.

Respond with ONLY minified JSON on a single line, no prose and no code fences:
{"description": string, "tags": string[]}

- description: one factual sentence (max 200 chars) — main subject, setting, dominant colors, mood, and orientation (portrait/landscape/square). Written so it can be matched against a content brief.
- tags: 5 to 12 lowercase keywords — subjects, setting, colors, mood, style, orientation. No "#", no spaces inside a tag (use hyphens).`;
}

function parseCaption(text: string): { description: string; tags: string[] } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object in caption response.");
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    description?: unknown;
    tags?: unknown;
  };
  const description =
    typeof parsed.description === "string" ? parsed.description.trim() : "";
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().replace(/^#/, "").trim().replace(/\s+/g, "-"))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  if (!description && tags.length === 0) {
    throw new Error("Empty caption.");
  }
  return { description, tags: [...new Set(tags)] };
}

async function captionOne(
  absPath: string,
  folderAbs: string,
  env: Record<string, string>,
): Promise<{ description: string; tags: string[] }> {
  const response = query({
    prompt: captionPrompt(absPath),
    options: {
      model: CAPTION_MODEL,
      cwd: folderAbs,
      additionalDirectories: [folderAbs],
      allowedTools: ["Read"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      includePartialMessages: false,
      env,
    },
  });

  let text = "";
  for await (const message of response) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") text += block.text;
      }
    }
  }
  return parseCaption(text);
}

/**
 * Generate caption suggestions for the given asset ids. Never writes to the DB —
 * returns previews for the user to confirm. Each asset is captioned serially on
 * the shared Claude queue so no second Claude spawns beside a running task.
 */
export async function generateCaptionSuggestions(
  ids: string[],
): Promise<CaptionSuggestion[]> {
  const settings = await db.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  const env = buildEnv(settings.claudeAuthMode === "SUBSCRIPTION");

  const assets = await db.asset.findMany({
    where: { id: { in: ids } },
    include: { folder: true },
  });
  // Preserve caller order.
  const byId = new Map(assets.map((a) => [a.id, a]));

  const out: CaptionSuggestion[] = [];
  for (const id of ids) {
    const asset = byId.get(id);
    if (!asset) {
      out.push({ id, description: "", tags: [], error: "Asset not found." });
      continue;
    }
    const absPath = path.resolve(process.cwd(), asset.relPath);
    const folderAbs = path.resolve(process.cwd(), asset.folder.relPath);
    try {
      const caption = await runOnClaudeQueue(() =>
        captionOne(absPath, folderAbs, env),
      );
      out.push({ id, ...caption });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.push({ id, description: "", tags: [], error: msg });
    }
  }
  return out;
}
