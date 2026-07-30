import path from "node:path";
import { db } from "@/lib/db-client";
import { DATA_ROOT, toRelative, runFolderSlug } from "@/lib/paths";
import { openRunWorkspace } from "@/lib/run-workspace";
import { resolveProviderModel } from "@/lib/models";
import { buildFontFaceCss } from "@/lib/font-css";
import { buildRunPrompt } from "@/lib/prompt-builder";
import { rankAssets } from "@/lib/asset-ranker";
import { emitRunEvent, type RunBusEvent } from "@/lib/run-bus";
import {
  RUN_TOOLS,
  registerToolContext,
  releaseRunToolContext,
  type RunToolContext,
} from "@/lib/run-tools";
import type { ToolDef } from "@/lib/run-tools";
import { RESEARCH_TOOLS } from "@/lib/research-tools";
import { isTavilyConfigured } from "@/lib/tavily";
import {
  registerRunController,
  releaseRunController,
} from "@/lib/run-control";
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
  // Cancelled while still queued — skip execution entirely.
  if (run.status === "CANCELLED") return;

  const { task } = run;
  const settings = await db.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  // Engine is model-driven (no global provider toggle). A campaign task pins its
  // provider; otherwise the first chosen model decides, falling back to Claude.
  const { provider, model } = resolveProviderModel({
    pinnedProvider: task.provider,
    candidates: [run.model, task.model, task.workflow.defaultModel],
    claudeDefault: settings.defaultModel,
    codexDefault: settings.codexModel,
  });

  // Web research. Null hides the tools completely — they never reach allowedTools
  // or the MCP tools/list, so the agent cannot burn a turn on a call that fails.
  const research =
    task.workflow.researchMode !== "OFF" && (await isTavilyConfigured())
      ? task.workflow.researchMode
      : null;

  // --- output prefix: data/tasks/<workflow>/<task-name>-<YYYY-MM-DD>-<HHmm> ---
  const tasksPrefix = toRelative(
    path.join(DATA_ROOT, "tasks", task.workflow.slug),
  );
  const outputRelPath = await uniqueRunPrefix(
    `${tasksPrefix}/${runFolderSlug(task.name, new Date())}`,
  );

  // Inputs live in the blob store, but the agent reads photos off disk and the
  // renderer loads its page over file://. Stage everything this run needs into
  // one local workspace; on the local driver this resolves to data/ directly.
  const workspace = await openRunWorkspace(taskRunId, outputRelPath);
  const outDirAbs = workspace.outDirAbs;

  const assetDirAbs = task.assetFolder
    ? await workspace.dir(task.assetFolder.relPath, "assets")
    : null;
  const assets = (task.assetFolder?.assets ?? []).map((a) => ({
    filename: a.filename,
    absPath: path.join(assetDirAbs ?? "", a.filename),
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
  const globalDirAbs =
    globalAssetRows.length > 0
      ? await workspace.dir(
          toRelative(path.join(DATA_ROOT, "assets", task.workflow.slug, "_global")),
          "global",
        )
      : null;
  const globalAssets = globalAssetRows.map((a) => ({
    filename: a.filename,
    absPath: path.join(globalDirAbs ?? "", a.filename),
    kind: a.kind,
    description: a.description,
  }));

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

  // The renderer loads font files over file://, so they have to be on disk too.
  const fontPaths = await workspace.files(
    fonts.flatMap((f) => f.variants.map((v) => v.relPath)),
    "fonts",
  );
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
    (relPath) => fontPaths.get(relPath) ?? relPath,
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
    research,
  });

  const toolContext: RunToolContext = {
    taskRunId,
    outDirAbs,
    outPrefix: outputRelPath,
    fontFaceCss,
    assets,
    // A photo the agent sources mid-run joins the task's own folder, so the
    // next run over the same folder already has it. No folder, no stock tools.
    importTarget:
      task.assetFolder && assetDirAbs
        ? {
            folderId: task.assetFolder.id,
            relDir: task.assetFolder.relPath,
            dirAbs: assetDirAbs,
          }
        : null,
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
  // Per-run abort so a stop action can cancel the agent mid-flight.
  const abortController = new AbortController();
  registerRunController(taskRunId, abortController);

  const tools = [
    ...(RUN_TOOLS as unknown as ToolDef<unknown>[]),
    ...(research ? RESEARCH_TOOLS : []),
  ];

  const shared = {
    prompt,
    model,
    cwd: outDirAbs,
    additionalDirectories,
    tools,
    toolContext,
    abortController,
    record,
    onSessionId,
  };

  // Codex runs out-of-process, so its retroz tools are served over HTTP.
  const mcpToken =
    provider === "CODEX" ? registerToolContext(toolContext, tools) : null;

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

    // A user stop wins over whatever the backend reports.
    const finalStatus = abortController.signal.aborted
      ? "CANCELLED"
      : result.ok
        ? "DONE"
        : "FAILED";

    await db.taskRun.update({
      where: { id: taskRunId },
      data: {
        status: finalStatus,
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
      status: finalStatus,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      cacheCreationTokens: result.cacheCreationTokens,
      cacheReadTokens: result.cacheReadTokens,
      costUsd: result.costUsd,
    });
  } catch (err) {
    // An abort surfaces as a thrown error in the backend — treat it as a cancel.
    if (abortController.signal.aborted) {
      await db.taskRun.update({
        where: { id: taskRunId },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });
      await record("STATUS", { status: "CANCELLED" });
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      await db.taskRun.update({
        where: { id: taskRunId },
        data: { status: "FAILED", finishedAt: new Date(), error: msg },
      });
      await record("ERROR", { message: msg });
      await record("STATUS", { status: "FAILED" });
    }
  } finally {
    releaseRunController(taskRunId);
    if (mcpToken) releaseRunToolContext(mcpToken);
    // Rendered PNGs are already stored by the render tool; this captures the
    // HTML sources and anything else the agent wrote, then drops the scratch.
    await workspace.close().catch(() => {});
  }
}

/**
 * Runs are keyed by task name plus minute, so two runs of the same task inside
 * one minute would otherwise share an output folder. Suffix until free.
 */
async function uniqueRunPrefix(base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  while (
    await db.taskRun.findFirst({
      where: { outputRelPath: candidate },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${++n}`;
  }
  return candidate;
}
