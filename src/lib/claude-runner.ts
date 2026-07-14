import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import {
  query,
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/lib/db-client";
import { DATA_ROOT, toRelative, runFolderStamp } from "@/lib/paths";
import { DEFAULT_MODEL } from "@/lib/models";
import { renderHtmlToPng } from "@/lib/png-compositor";
import { buildFontFaceCss } from "@/lib/font-css";
import { buildRunPrompt } from "@/lib/prompt-builder";
import { rankAssets } from "@/lib/asset-ranker";
import { emitRunEvent, type RunBusEvent } from "@/lib/run-bus";
import type { RunEventType } from "@/generated/prisma/enums";

const ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Glob",
  "Grep",
  "Bash",
  "mcp__retroz__render_html_to_png",
  "mcp__retroz__list_assets",
  "mcp__retroz__search_assets",
];

// Max source photos injected into the run prompt. Larger folders are ranked and
// truncated to this; Claude reaches the rest through search_assets.
const ASSET_PROMPT_LIMIT = 12;

/** Execute one queued TaskRun end-to-end. Persists events + artifacts. */
export async function executeRun(taskRunId: string): Promise<void> {
  const run = await db.taskRun.findUnique({
    where: { id: taskRunId },
    include: {
      task: {
        include: {
          workflow: true,
          assetFolder: { include: { assets: true } },
        },
      },
    },
  });
  if (!run) return;

  const { task } = run;
  const settings = await db.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const model =
    run.model ?? task.model ?? task.workflow.defaultModel ?? settings.defaultModel ?? DEFAULT_MODEL;

  // --- output folder: data/tasks/<workflow>/<Task Name | YYYY-MM-DD HH:mm> ---
  const stamp = runFolderStamp(new Date());
  const runFolderName = `${task.name} | ${stamp}`;
  const outDirAbs = path.join(
    DATA_ROOT,
    "tasks",
    task.workflow.slug,
    runFolderName,
  );
  await fs.mkdir(outDirAbs, { recursive: true });
  const outputRelPath = toRelative(outDirAbs);

  const assetDirAbs = task.assetFolder
    ? path.resolve(process.cwd(), task.assetFolder.relPath)
    : null;
  const assets = (task.assetFolder?.assets ?? []).map((a) => ({
    filename: a.filename,
    absPath: path.resolve(process.cwd(), a.relPath),
    width: a.width,
    height: a.height,
    description: a.description,
    tags: a.tags,
  }));

  // Relevance pre-pass: for large folders, only the top matches for this run's
  // instruction go into the prompt. The full set stays available to Claude via
  // the search_assets tool. Keeps big asset banks from bloating every prompt.
  const rankQuery = [
    task.instruction,
    task.workflow.globalInstruction,
    task.name,
  ]
    .filter(Boolean)
    .join(" ");
  const rankedAssets = rankAssets(rankQuery, assets, ASSET_PROMPT_LIMIT);
  const assetsTruncated = rankedAssets.length < assets.length;

  // --- global workflow assets: reusable across every task (bg, logo, patterns) ---
  const globalAssetRows = await db.workflowAsset.findMany({
    where: { workflowId: task.workflowId },
    orderBy: { createdAt: "asc" },
  });
  const globalAssets = globalAssetRows.map((a) => ({
    filename: a.filename,
    absPath: path.resolve(process.cwd(), a.relPath),
    kind: a.kind,
    description: a.description,
  }));
  const globalDirAbs =
    globalAssets.length > 0
      ? path.join(DATA_ROOT, "assets", task.workflow.slug, "_global")
      : null;

  // --- fonts available to this run: workflow-assigned, else whole enabled bank ---
  const assigned = await db.workflowFont.findMany({
    where: { workflowId: task.workflowId },
    include: { font: { include: { variants: true } } },
  });
  let fonts = assigned.map((w) => w.font).filter((f) => f.enabled);
  if (fonts.length === 0) {
    fonts = await db.font.findMany({
      where: { enabled: true },
      include: { variants: true },
    });
  }
  const fontIds = new Set(fonts.map((f) => f.id));
  const allPairings = await db.fontPairing.findMany({
    include: { headingFont: true, bodyFont: true },
  });
  const pairings = allPairings
    .filter((p) => fontIds.has(p.headingFontId) && fontIds.has(p.bodyFontId))
    .map((p) => ({
      name: p.name,
      heading: p.headingFont.family,
      body: p.bodyFont.family,
      moodTags: p.moodTags,
    }));

  const fontFaceCss = buildFontFaceCss(
    fonts.map((f) => ({
      family: f.family,
      variants: f.variants.map((v) => ({
        weight: v.weight,
        weightRange: v.weightRange,
        style: v.style,
        relPath: v.relPath,
      })),
    })),
  );
  const fontsForPrompt = fonts.map((f) => ({
    family: f.family,
    category: f.category,
    moodTags: f.moodTags,
  }));

  // --- skills for this run: workflow-assigned limits the set; none => all ---
  const assignedSkills = await db.workflowSkill.findMany({
    where: { workflowId: task.workflowId },
    include: { skill: true },
  });
  const skillRows = assignedSkills.map((w) => w.skill).filter((s) => s.enabled);
  const skillsOption: string[] | "all" =
    skillRows.length > 0 ? skillRows.map((s) => s.slug) : "all";
  const skillsForPrompt = skillRows.map((s) => ({
    slug: s.slug,
    description: s.description,
  }));

  // --- event recorder (persist + live tap) ---
  let seq = 0;
  async function record(type: RunEventType, payload: unknown) {
    const s = seq++;
    const ts = new Date();
    await db.runEvent.create({
      data: { taskRunId, seq: s, type, payload: payload as object },
    });
    emitRunEvent(taskRunId, {
      seq: s,
      type: type as RunBusEvent["type"],
      payload,
      ts: ts.toISOString(),
    });
  }

  await db.taskRun.update({
    where: { id: taskRunId },
    data: { status: "RUNNING", startedAt: new Date(), model, outputRelPath },
  });
  await record("STATUS", { status: "RUNNING" });

  // --- per-run MCP tools ---
  const mcpServer = createSdkMcpServer({
    name: "retroz",
    version: "1.0.0",
    tools: [
      tool(
        "render_html_to_png",
        "Render a self-contained HTML document to a PNG saved in this run's output folder. Use for every final image. The HTML may reference source photos via absolute file:// paths or data URIs.",
        {
          html: z.string().describe("Complete self-contained HTML document."),
          filename: z
            .string()
            .describe("Output filename, e.g. '01-hook.png'."),
          width: z.number().int().min(64).max(4096).default(1080),
          height: z.number().int().min(64).max(4096).default(1080),
        },
        async (args) => {
          try {
            const res = await renderHtmlToPng({
              html: args.html,
              outDir: outDirAbs,
              filename: args.filename,
              width: args.width,
              height: args.height,
              fontFaceCss,
            });
            const relPath = toRelative(res.absPath);
            await db.runArtifact.create({
              data: {
                taskRunId,
                kind: "PNG",
                filename: res.filename,
                relPath,
                width: res.width,
                height: res.height,
              },
            });
            await record("ARTIFACT", {
              filename: res.filename,
              relPath,
              width: res.width,
              height: res.height,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Saved ${res.filename} (${res.width}x${res.height}).`,
                },
              ],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `Render failed: ${msg}` }],
              isError: true,
            };
          }
        },
      ),
      tool(
        "list_assets",
        "List ALL source photos for this task with their descriptions, tags, and absolute paths. Use search_assets instead when the folder is large and you only need the ones relevant to the current content.",
        {},
        async () => ({
          content: [
            {
              type: "text",
              text:
                assets.length === 0
                  ? "No source assets."
                  : assets.map(formatAssetLine).join("\n"),
            },
          ],
        }),
      ),
      tool(
        "search_assets",
        "Find the source photos most relevant to a description without loading any images. Returns ranked filenames, absolute paths, descriptions, and tags — read only the finalists you actually intend to use. Prefer this over list_assets for large folders.",
        {
          query: z
            .string()
            .describe(
              "What you are looking for, e.g. 'sunset beach vertical warm tones'.",
            ),
          limit: z.number().int().min(1).max(50).default(10),
        },
        async (args) => {
          const ranked = rankAssets(args.query, assets, args.limit);
          return {
            content: [
              {
                type: "text",
                text:
                  ranked.length === 0
                    ? "No source assets."
                    : ranked.map(formatAssetLine).join("\n"),
              },
            ],
          };
        },
      ),
    ],
  });

  const prompt = buildRunPrompt({
    workflowName: task.workflow.name,
    platform: task.workflow.platform,
    globalInstruction: task.workflow.globalInstruction,
    taskName: task.name,
    taskInstruction: task.instruction,
    assetDirAbs,
    assets: rankedAssets,
    assetsTotal: assets.length,
    assetsTruncated,
    globalAssets,
    outDirAbs,
    fonts: fontsForPrompt,
    pairings,
    skills: skillsForPrompt,
  });

  // --- auth env: subscription => strip API key so the CLI uses local login ---
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") env[k] = v;
  }
  if (settings.claudeAuthMode === "SUBSCRIPTION") {
    delete env.ANTHROPIC_API_KEY;
  }

  try {
    const additionalDirectories = [assetDirAbs, globalDirAbs].filter(
      (d): d is string => Boolean(d),
    );
    const response = query({
      prompt,
      options: {
        model,
        cwd: outDirAbs,
        additionalDirectories,
        settingSources: ["user", "project"],
        skills: skillsOption,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        allowedTools: ALLOWED_TOOLS,
        mcpServers: { retroz: mcpServer },
        includePartialMessages: false,
        env,
      },
    });

    for await (const message of response) {
      if (message.type === "system") {
        if (!run.claudeSessionId && message.session_id) {
          await db.taskRun.update({
            where: { id: taskRunId },
            data: { claudeSessionId: message.session_id },
          });
        }
        continue;
      }

      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text.trim()) {
            await record("TEXT", { text: block.text });
          } else if (block.type === "tool_use") {
            await record("TOOL", {
              name: block.name,
              input: summarizeToolInput(block.name, block.input),
            });
          }
        }
        continue;
      }

      if (message.type === "result") {
        // Both success and error results carry usage — tokens are spent either
        // way, so never drop them on failure.
        const usage = message.usage;
        const tokensIn = usage?.input_tokens ?? 0;
        const tokensOut = usage?.output_tokens ?? 0;
        const cacheCreationTokens = usage?.cache_creation_input_tokens ?? 0;
        const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
        const cost = message.total_cost_usd ?? 0;
        const ok = message.subtype === "success" && !message.is_error;
        await db.taskRun.update({
          where: { id: taskRunId },
          data: {
            status: ok ? "DONE" : "FAILED",
            finishedAt: new Date(),
            tokensIn,
            tokensOut,
            cacheCreationTokens,
            cacheReadTokens,
            numTurns: message.num_turns ?? 0,
            durationMs: message.duration_ms ?? null,
            durationApiMs: message.duration_api_ms ?? null,
            costUsd: cost,
            modelUsage: (message.modelUsage ?? undefined) as object | undefined,
            error: ok
              ? null
              : message.subtype === "success"
                ? "Run reported an error."
                : `Run failed: ${message.subtype}`,
          },
        });
        await record("STATUS", {
          status: ok ? "DONE" : "FAILED",
          tokensIn,
          tokensOut,
          cacheCreationTokens,
          cacheReadTokens,
          costUsd: cost,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.taskRun.update({
      where: { id: taskRunId },
      data: { status: "FAILED", finishedAt: new Date(), error: msg },
    });
    await record("ERROR", { message: msg });
    await record("STATUS", { status: "FAILED" });
  }
}

function formatAssetLine(a: {
  filename: string;
  absPath: string;
  description: string;
  tags: string[];
}): string {
  const tags = a.tags.length > 0 ? ` :: tags: ${a.tags.join(", ")}` : "";
  return `${a.filename} :: ${a.absPath} :: ${a.description || "(no description)"}${tags}`;
}

function summarizeToolInput(name: string, input: unknown): unknown {
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
