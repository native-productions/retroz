import path from "node:path";
import { db } from "@/lib/db-client";
import { DATA_ROOT, slugify, toRelative } from "@/lib/paths";
import { openRunWorkspace } from "@/lib/run-workspace";
import { selectEngine, dispatchAgentRun } from "@/lib/engine-dispatch";
import { imageToolName } from "@/lib/models";
import { buildFontFaceCss } from "@/lib/font-css";
import { buildWorkPrompt, buildWorkTurnPrompt } from "@/lib/work-prompt";
import { aspectRatioRule } from "@/lib/aspect-ratios";
import { ensureProjectAssetFolderRow } from "@/lib/project-assets";
import { stageRevisions } from "@/lib/render-revision";
import { emitRunEvent, type RunBusEvent } from "@/lib/run-bus";
import {
  RUN_TOOLS,
  registerToolContext,
  releaseRunToolContext,
  type RunToolAsset,
  type RunToolContext,
  type ToolDef,
} from "@/lib/run-tools";
import { CAPTION_TOOLS } from "@/lib/caption-tools";
import { RESEARCH_TOOLS } from "@/lib/research-tools";
import { BROWSE_TOOLS } from "@/lib/browse-tools";
import { extractUrls } from "@/lib/url-guard";
import { isTavilyConfigured } from "@/lib/tavily";
import {
  registerRunController,
  releaseRunController,
} from "@/lib/run-control";
import type { AgentRunResult } from "@/lib/agent-backend";
import type { RunEventType } from "@/generated/prisma/enums";

// The agent keeps a todo list in Work, so TodoWrite joins the built-in tool set.
const WORK_BASE_TOOLS = ["Read", "Write", "Glob", "Grep", "Bash", "TodoWrite"];

interface StoredMention {
  name: string;
  /** Asset id, or RunArtifact id when `kind` is "render". */
  assetId: string;
  relPath: string;
  /** Absent on turns recorded before renders became mentionable. */
  kind?: "asset" | "render";
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
      project: { include: { assetFolder: true } },
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

  const selection = await selectEngine({
    settings,
    pinnedProvider: project.provider,
    candidates: [
      run.model,
      session.model,
      project.defaultModel,
      workflow.defaultModel,
    ],
  });
  const { provider, model } = selection;

  if (selection.error) {
    await db.taskRun.update({
      where: { id: taskRunId },
      data: {
        status: "FAILED",
        startedAt: new Date(),
        finishedAt: new Date(),
        provider,
        error: selection.error,
      },
    });
    return;
  }

  // The turn this run belongs to, and whether it is the first of the session.
  const message = session.messages.find((m) => m.taskRunId === taskRunId);
  const priorTurns = session.messages.filter(
    (m) => m.taskRunId && m.taskRunId !== taskRunId,
  );
  const mentions = (message?.mentions as StoredMention[] | null) ?? [];
  // Two different things wear the same `@` chip: a source photo to compose over,
  // and a finished render to edit. They must not be confused — a render and an
  // asset can carry the identical filename.
  const assetMentions = mentions.filter((m) => m.kind !== "render");
  const renderMentions = mentions.filter((m) => m.kind === "render");

  // Two independent per-turn choices, because the capabilities share nothing:
  // research is Tavily over HTTP and needs an API key; browsing is a local
  // Playwright browser and needs none. A false value hides that tool set
  // completely. Rows written before either setting existed read as the default.
  const requestedResearch = message?.researchMode ?? "AUTO";
  const research =
    requestedResearch !== "OFF" && (await isTavilyConfigured())
      ? requestedResearch
      : null;
  const browse = message?.browseWeb ?? true;
  // Links the user pasted, named in the browsing directive so the agent opens
  // them instead of guessing at them.
  const urls = browse ? extractUrls(message?.text ?? "") : [];

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
  // Web captures are working material, not output: scratch() is the directory
  // the workspace deliberately does not upload on close.
  const webDirAbs = browse ? await workspace.scratch("web") : null;

  // --- images the agent can reach ---------------------------------------
  // The session's own uploads and the workflow's global bank are always staged.
  // Assets from other folders are staged only when this message mentioned one,
  // so a big asset bank never gets copied for a chat turn.
  const assets: (RunToolAsset & {
    origin: "session" | "project" | "folder" | "global";
  })[] = [];

  // The project library: images described once ("use this when you need the
  // Claude logo") and reachable on every turn. Also where photos the agent
  // sources from Wikimedia/Pexels land.
  // Created on demand rather than read, so the stock tools work on the very
  // first turn of a project the user has never opened the Assets tab for.
  const projectFolder = await ensureProjectAssetFolderRow(project.id);
  const projectDirAbs = await workspace.dir(projectFolder.relPath, "project");
  const importTarget: RunToolContext["importTarget"] = {
    folderId: projectFolder.id,
    relDir: projectFolder.relPath,
    dirAbs: projectDirAbs,
  };
  const projectRows = await db.asset.findMany({
    where: { folderId: projectFolder.id },
    orderBy: { createdAt: "asc" },
  });
  for (const a of projectRows) {
    assets.push({
      filename: a.filename,
      absPath: path.join(projectDirAbs, a.filename),
      width: a.width,
      height: a.height,
      description: a.description,
      tags: a.tags,
      origin: "project",
    });
  }

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

  const mentionedIds = new Set(assetMentions.map((m) => m.assetId));
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

  const mentionedNames = new Set(assetMentions.map((m) => m.name));
  const mentioned = assets.filter((a) => mentionedNames.has(a.filename));
  const available = assets.filter((a) => !mentionedNames.has(a.filename));

  // --- renders this turn asked to revise ---------------------------------
  // Staged after the assets, because rehoming a stored document's photo paths
  // needs the list of where those photos live in THIS run.
  const revisions = await stageRevisions({
    artifactIds: renderMentions.map((m) => m.assetId),
    sessionId: session.id,
    workspace,
    assets,
  });
  const revisionDirs = [
    ...new Set(
      revisions.flatMap((r) => [
        path.dirname(r.pngAbsPath),
        ...(r.htmlAbsPath ? [path.dirname(r.htmlAbsPath)] : []),
      ]),
    ),
  ];

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

  // --- skills ---
  // Under Claude the SDK loads these off disk from .claude/skills, so the
  // prompt only needs to name them. Codex has no such loader, so any skill the
  // message asked for by /slug is inlined below instead.
  const assignedSkills = await db.workflowSkill.findMany({
    where: { workflowId: workflow.id },
    include: { skill: true },
  });
  const assignedRows = assignedSkills
    .map((w) => w.skill)
    .filter((s) => s.enabled);
  // No assignment means the workflow runs with the whole enabled bank.
  const skillRows =
    assignedRows.length > 0
      ? assignedRows
      : await db.skill.findMany({ where: { enabled: true } });
  const skillsOption: string[] | "all" =
    assignedRows.length > 0 ? assignedRows.map((s) => s.slug) : "all";

  // `/slug` in the message is an explicit "use this recipe".
  const requestedSlugs = new Set(
    [...(message?.text ?? "").matchAll(/(?:^|\s)\/([a-z0-9][a-z0-9._-]*)/gi)].map(
      (m) => m[1].toLowerCase(),
    ),
  );
  const requestedSkills = skillRows.filter((s) =>
    requestedSlugs.has(s.slug.toLowerCase()),
  );
  const inlinedSkills =
    provider === "CLAUDE"
      ? []
      : requestedSkills.map((s) => ({
          slug: s.slug,
          name: s.name,
          content: s.content,
        }));

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

  // The session's locked shape, restated on every turn so a change mid-session
  // takes effect on the next render rather than the next session.
  const aspectRule = aspectRatioRule(session.aspectRatio);

  // What earlier turns produced. The workspace hydrates these back into the
  // output folder, so they are on disk either way — this is what makes the agent
  // aware of them when the resumed engine session no longer remembers.
  // Newest write of a filename wins, exactly like the canvas does it.
  const priorArtifacts = await db.runArtifact.findMany({
    where: { taskRun: { taskId: run.taskId }, kind: "PNG" },
    orderBy: { createdAt: "asc" },
    select: { filename: true, width: true, height: true },
  });
  const sessionRenders = [
    ...new Map(priorArtifacts.map((a) => [a.filename, a])).values(),
  ];

  // Only the OpenAI-compatible engine can end up without one: a text-only
  // provider model never gets view_image registered.
  const imageTool = imageToolName(
    provider,
    selection.apiModel?.supportsVision ?? true,
  );

  const fullPrompt = buildWorkPrompt({
    provider,
    imageTool,
    workflowName: workflow.name,
    platform: workflow.platform,
    globalInstruction: workflow.globalInstruction,
    projectName: project.name,
    projectInstruction: project.instruction,
    outDirAbs,
    mentioned,
    revisions,
    sessionRenders,
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
    inlinedSkills,
    aspectRule,
    research,
    browse,
    urls,
    message: message?.text ?? "",
  });

  // Resume only makes sense once this session has actually run before.
  const canResume = Boolean(session.engineSessionId) && priorTurns.length > 0;

  // A resumed session is still holding the brief it opened with, so re-send it
  // when the project has been edited since this session's previous turn.
  const lastTurnAt = (
    await db.taskRun.findFirst({
      where: { taskId: run.taskId, id: { not: taskRunId } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })
  )?.createdAt;
  const briefChanged =
    Boolean(lastTurnAt) && project.updatedAt > (lastTurnAt as Date);

  const turnPrompt = buildWorkTurnPrompt({
    mentioned,
    revisions,
    sessionRenders,
    inlinedSkills,
    revisedBrief: briefChanged
      ? { projectName: project.name, instruction: project.instruction }
      : null,
    aspectRule,
    research,
    browse,
    urls,
    message: message?.text ?? "",
  });

  const toolContext: RunToolContext = {
    taskRunId,
    provider,
    imageTool,
    outDirAbs,
    outPrefix: outputRelPath,
    webDirAbs,
    fontFaceCss,
    assets,
    importTarget,
    workSessionId: session.id,
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

  const tools = [
    ...(RUN_TOOLS as unknown as ToolDef<unknown>[]),
    ...(CAPTION_TOOLS as unknown as ToolDef<unknown>[]),
    ...(research ? RESEARCH_TOOLS : []),
    ...(browse ? (BROWSE_TOOLS as unknown as ToolDef<unknown>[]) : []),
  ];

  const mcpToken =
    provider === "CODEX" ? registerToolContext(toolContext, tools) : null;

  async function launch(resume: string | null): Promise<AgentRunResult> {
    const shared = {
      prompt: resume ? turnPrompt : fullPrompt,
      model,
      cwd: outDirAbs,
      // The revision copies and web captures live outside the output folder on
      // purpose (they must not be published), so they have to be granted
      // explicitly or the agent cannot read back what it just made.
      additionalDirectories: [
        outDirAbs,
        ...revisionDirs,
        ...(webDirAbs ? [webDirAbs] : []),
      ],
      tools,
      toolContext,
      baseTools: WORK_BASE_TOOLS,
      abortController,
      record,
      onSessionId,
      resumeSessionId: resume,
    };
    return dispatchAgentRun({
      selection,
      shared,
      codexReasoningEffort: settings.codexReasoningEffort,
      claudeAuthMode: settings.claudeAuthMode,
      skills: skillsOption,
      mcpToken,
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
