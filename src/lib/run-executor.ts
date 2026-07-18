import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/lib/db-client";
import { DATA_ROOT, toRelative, runFolderStamp } from "@/lib/paths";
import { resolveModel } from "@/lib/models";
import { buildFontFaceCss } from "@/lib/font-css";
import { buildRunPrompt } from "@/lib/prompt-builder";
import { rankAssets } from "@/lib/asset-ranker";
import { emitRunEvent, type RunBusEvent } from "@/lib/run-bus";
import {
  RUN_TOOLS,
  registerRunToolContext,
  releaseRunToolContext,
  type RunToolContext,
} from "@/lib/run-tools";
import type { ToolDef } from "@/lib/run-tools";
import { runClaudeAgent } from "@/lib/claude-backend";
import { runCodexAgent } from "@/lib/codex-backend";
import type { RunEventType } from "@/generated/prisma/enums";

// Max source photos injected into the run prompt. Larger folders are ranked and
// truncated to this; the agent reaches the rest through search_assets.
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

  // A task may pin its engine (campaign tasks do); else use the global setting.
  const provider = task.provider ?? settings.provider;
  const model = resolveModel(provider, [
    run.model,
    task.model,
    task.workflow.defaultModel,
    provider === "CODEX" ? settings.codexModel : settings.defaultModel,
  ]);

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
  // instruction go into the prompt. The full set stays available to the agent
  // via the search_assets tool. Keeps big asset banks from bloating every prompt.
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

  // --- skills (Claude-only: they live in .claude/skills, loaded via the SDK) ---
  const assignedSkills = await db.workflowSkill.findMany({
    where: { workflowId: task.workflowId },
    include: { skill: true },
  });
  const skillRows = assignedSkills.map((w) => w.skill).filter((s) => s.enabled);
  const skillsOption: string[] | "all" =
    skillRows.length > 0 ? skillRows.map((s) => s.slug) : "all";
  const skillsForPrompt =
    provider === "CLAUDE"
      ? skillRows.map((s) => ({ slug: s.slug, description: s.description }))
      : [];

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
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      provider,
      model,
      outputRelPath,
    },
  });
  await record("STATUS", { status: "RUNNING" });

  const prompt = buildRunPrompt({
    provider,
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

  const toolContext: RunToolContext = {
    taskRunId,
    outDirAbs,
    fontFaceCss,
    assets,
    record,
  };

  let sessionSaved = false;
  const onSessionId = async (sessionId: string) => {
    if (sessionSaved || run.sessionId) return;
    sessionSaved = true;
    await db.taskRun.update({ where: { id: taskRunId }, data: { sessionId } });
  };

  const additionalDirectories = [assetDirAbs, globalDirAbs].filter(
    (d): d is string => Boolean(d),
  );
  const shared = {
    prompt,
    model,
    cwd: outDirAbs,
    additionalDirectories,
    tools: RUN_TOOLS as unknown as ToolDef<unknown>[],
    toolContext,
    record,
    onSessionId,
  };

  // Codex runs out-of-process, so its retroz tools are served over HTTP.
  const mcpToken = provider === "CODEX" ? registerRunToolContext(toolContext) : null;

  try {
    const result =
      provider === "CODEX"
        ? await runCodexAgent({
            ...shared,
            reasoningEffort: settings.codexReasoningEffort,
            mcpServerUrl: `http://127.0.0.1:${process.env.PORT ?? "3020"}/api/mcp/${mcpToken}`,
          })
        : await runClaudeAgent({
            ...shared,
            skills: skillsOption,
            stripApiKey: settings.claudeAuthMode === "SUBSCRIPTION",
          });

    await db.taskRun.update({
      where: { id: taskRunId },
      data: {
        status: result.ok ? "DONE" : "FAILED",
        finishedAt: new Date(),
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        cacheCreationTokens: result.cacheCreationTokens,
        cacheReadTokens: result.cacheReadTokens,
        numTurns: result.numTurns,
        durationMs: result.durationMs,
        durationApiMs: result.durationApiMs,
        costUsd: result.costUsd,
        modelUsage: result.modelUsage ?? undefined,
        error: result.error,
      },
    });
    await record("STATUS", {
      status: result.ok ? "DONE" : "FAILED",
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      cacheCreationTokens: result.cacheCreationTokens,
      cacheReadTokens: result.cacheReadTokens,
      costUsd: result.costUsd,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.taskRun.update({
      where: { id: taskRunId },
      data: { status: "FAILED", finishedAt: new Date(), error: msg },
    });
    await record("ERROR", { message: msg });
    await record("STATUS", { status: "FAILED" });
  } finally {
    if (mcpToken) releaseRunToolContext(mcpToken);
  }
}
