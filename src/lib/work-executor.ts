import path from "node:path";
import { db } from "@/lib/db-client";
import { DATA_ROOT, slugify, toRelative } from "@/lib/paths";
import { openRunWorkspace } from "@/lib/run-workspace";
import { resolveProviderModel } from "@/lib/models";
import { buildFontFaceCss } from "@/lib/font-css";
import { buildWorkPrompt, buildWorkTurnPrompt } from "@/lib/work-prompt";
import { emitRunEvent, type RunBusEvent } from "@/lib/run-bus";
import {
  RUN_TOOLS,
  registerRunToolContext,
  releaseRunToolContext,
  type RunToolAsset,
  type RunToolContext,
  type ToolDef,
} from "@/lib/run-tools";
import {
  registerRunController,
  releaseRunController,
} from "@/lib/run-control";
import { runClaudeAgent } from "@/lib/claude-backend";
import { runCodexAgent } from "@/lib/codex-backend";
import type { AgentRunResult } from "@/lib/agent-backend";
import type { RunEventType } from "@/generated/prisma/enums";

// The agent keeps a todo list in Work, so TodoWrite joins the built-in tool set.
const WORK_BASE_TOOLS = ["Read", "Write", "Glob", "Grep", "Bash", "TodoWrite"];

interface StoredMention {
  name: string;
  assetId: string;
  relPath: string;
}

/**
 * Execute one conversation turn: a TaskRun on the session's hidden Task. Mirrors
 * `executeRun` for all the bookkeeping, and differs in three ways — the output
 * folder belongs to the session rather than the run, the engine session is
 * resumed so turns share context, and the prompt is a chat message.
 */
export async function executeWorkTurn(taskRunId: string): Promise<void> {
  const run = await db.taskRun.findUnique({
    where: { id: taskRunId },
    include: { task: { include: { workflow: true } } },
  });
  if (!run || run.status === "CANCELLED") return;

  const session = await db.workSession.findUnique({
    where: { taskId: run.taskId },
    include: {
      project: true,
      assetFolder: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) return;

  const { task } = run;
  const workflow = task.workflow;
  const project = session.project;

  const settings = await db.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const { provider, model } = resolveProviderModel({
    pinnedProvider: project.provider,
    candidates: [
      run.model,
      session.model,
      project.defaultModel,
      workflow.defaultModel,
    ],
    claudeDefault: settings.defaultModel,
    codexDefault: settings.codexModel,
  });

  // The turn this run belongs to, and whether it is the first of the session.
  const message = session.messages.find((m) => m.taskRunId === taskRunId);
  const priorTurns = session.messages.filter(
    (m) => m.taskRunId && m.taskRunId !== taskRunId,
  );
  const mentions = (message?.mentions as StoredMention[] | null) ?? [];

  // One folder per session, so renders accumulate as the conversation goes. The
  // first turn names it; later turns reuse whatever that run recorded.
  const outputRelPath =
    (
      await db.taskRun.findFirst({
        where: { taskId: run.taskId, outputRelPath: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { outputRelPath: true },
      })
    )?.outputRelPath ??
    toRelative(
      path.join(
        DATA_ROOT,
        "work",
        project.slug,
        // Titles are auto-derived from the opening message, so keep the folder
        // segment short rather than echoing a whole sentence.
        `${slugify(session.title, 32)}-${session.id.slice(-6)}`,
      ),
    );

  const workspace = await openRunWorkspace(taskRunId, outputRelPath);
  const outDirAbs = workspace.outDirAbs;

  // --- images the agent can reach ---------------------------------------
  // The session's own uploads and the workflow's global bank are always staged.
  // Assets from other folders are staged only when this message mentioned one,
  // so a big asset bank never gets copied for a chat turn.
  const assets: (RunToolAsset & {
    origin: "session" | "folder" | "global";
  })[] = [];

  if (session.assetFolder) {
    const dirAbs = await workspace.dir(session.assetFolder.relPath, "session");
    const rows = await db.asset.findMany({
      where: { folderId: session.assetFolder.id },
      orderBy: { createdAt: "asc" },
    });
    for (const a of rows) {
      assets.push({
        filename: a.filename,
        absPath: path.join(dirAbs, a.filename),
        width: a.width,
        height: a.height,
        description: a.description,
        tags: a.tags,
        origin: "session",
      });
    }
  }

  const mentionedIds = new Set(mentions.map((m) => m.assetId));
  const outsideFolders = await db.assetFolder.findMany({
    where: {
      workflowId: workflow.id,
      id: { not: session.assetFolderId ?? "" },
      assets: { some: { id: { in: [...mentionedIds] } } },
    },
  });
  for (const [i, folder] of outsideFolders.entries()) {
    const dirAbs = await workspace.dir(folder.relPath, `folder-${i}`);
    const rows = await db.asset.findMany({ where: { folderId: folder.id } });
    for (const a of rows) {
      assets.push({
        filename: a.filename,
        absPath: path.join(dirAbs, a.filename),
        width: a.width,
        height: a.height,
        description: a.description,
        tags: a.tags,
        origin: "folder",
      });
    }
  }

  const globalRows = await db.workflowAsset.findMany({
    where: { workflowId: workflow.id },
    orderBy: { createdAt: "asc" },
  });
  if (globalRows.length > 0) {
    const dirAbs = await workspace.dir(
      toRelative(path.join(DATA_ROOT, "assets", workflow.slug, "_global")),
      "global",
    );
    for (const a of globalRows) {
      assets.push({
        filename: a.filename,
        absPath: path.join(dirAbs, a.filename),
        width: a.width,
        height: a.height,
        description: a.description,
        tags: [],
        origin: "global",
      });
    }
  }

  const mentionedNames = new Set(mentions.map((m) => m.name));
  const mentioned = assets.filter((a) => mentionedNames.has(a.filename));
  const available = assets.filter((a) => !mentionedNames.has(a.filename));

  // --- fonts available to this session: workflow-assigned, else the bank ---
  const assigned = await db.workflowFont.findMany({
    where: { workflowId: workflow.id },
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

  // --- skills (Claude-only: they live in .claude/skills, loaded by the SDK) ---
  const assignedSkills = await db.workflowSkill.findMany({
    where: { workflowId: workflow.id },
    include: { skill: true },
  });
  const skillRows = assignedSkills.map((w) => w.skill).filter((s) => s.enabled);
  const skillsOption: string[] | "all" =
    skillRows.length > 0 ? skillRows.map((s) => s.slug) : "all";

  // --- event recorder (persist + live tap) ---
  let seq = 0;
  async function record(type: RunEventType, payload: unknown) {
    const s = seq++;
    await db.runEvent.create({
      data: { taskRunId, seq: s, type, payload: payload as object },
    });
    emitRunEvent(taskRunId, {
      seq: s,
      type: type as RunBusEvent["type"],
      payload,
      ts: new Date().toISOString(),
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

  const fullPrompt = buildWorkPrompt({
    provider,
    workflowName: workflow.name,
    platform: workflow.platform,
    globalInstruction: workflow.globalInstruction,
    projectName: project.name,
    projectInstruction: project.instruction,
    outDirAbs,
    mentioned,
    available,
    fonts: fonts.map((f) => ({
      family: f.family,
      category: f.category,
      moodTags: f.moodTags,
    })),
    pairings,
    skills:
      provider === "CLAUDE"
        ? skillRows.map((s) => ({ slug: s.slug, description: s.description }))
        : [],
    message: message?.text ?? "",
  });

  // Resume only makes sense once this session has actually run before.
  const canResume = Boolean(session.engineSessionId) && priorTurns.length > 0;
  const turnPrompt = buildWorkTurnPrompt({
    mentioned,
    message: message?.text ?? "",
  });

  const toolContext: RunToolContext = {
    taskRunId,
    outDirAbs,
    outPrefix: outputRelPath,
    fontFaceCss,
    assets,
    record,
  };

  const onSessionId = async (engineSessionId: string) => {
    await db.taskRun.update({
      where: { id: taskRunId },
      data: { sessionId: engineSessionId },
    });
    await db.workSession.update({
      where: { id: session.id },
      data: { engineSessionId },
    });
  };

  const abortController = new AbortController();
  registerRunController(taskRunId, abortController);

  const mcpToken =
    provider === "CODEX" ? registerRunToolContext(toolContext) : null;

  async function launch(resume: string | null): Promise<AgentRunResult> {
    const shared = {
      prompt: resume ? turnPrompt : fullPrompt,
      model,
      cwd: outDirAbs,
      additionalDirectories: [outDirAbs],
      tools: RUN_TOOLS as unknown as ToolDef<unknown>[],
      toolContext,
      baseTools: WORK_BASE_TOOLS,
      abortController,
      record,
      onSessionId,
      resumeSessionId: resume,
    };
    return provider === "CODEX"
      ? runCodexAgent({
          ...shared,
          reasoningEffort: settings.codexReasoningEffort,
          mcpServerUrl: `http://127.0.0.1:${process.env.PORT ?? "3020"}/api/mcp/${mcpToken}`,
        })
      : runClaudeAgent({
          ...shared,
          skills: skillsOption,
          stripApiKey: settings.claudeAuthMode === "SUBSCRIPTION",
        });
  }

  try {
    let result: AgentRunResult;
    try {
      result = await launch(canResume ? session.engineSessionId : null);
    } catch (err) {
      // The engine drops sessions (restarts, cleared history). Rather than fail
      // the turn, fall back to a cold run carrying the full working agreement.
      if (!canResume || abortController.signal.aborted) throw err;
      await record("SYSTEM", {
        message: "Previous engine session unavailable — starting a fresh one.",
      });
      result = await launch(null);
    }

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
    // Touch the session so the rail reorders on the turn, not on the next edit.
    await db.workSession
      .update({ where: { id: session.id }, data: { updatedAt: new Date() } })
      .catch(() => {});
    await workspace.close().catch(() => {});
  }
}
