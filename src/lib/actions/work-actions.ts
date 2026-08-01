"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db-client";
import { mediaUrl } from "@/lib/media";
import { slugify } from "@/lib/paths";
import { rankAssets } from "@/lib/asset-ranker";
import { storage } from "@/lib/storage";
import { enqueueWorkTurn } from "@/lib/run-queue";
import { ensureProjectAssetFolderRow } from "@/lib/project-assets";
import { removeTaskOutputs } from "@/lib/task-outputs";
import type { WorkAttachment, WorkSkillOption } from "@/lib/work-types";
import {
  workProjectCreateSchema,
  workProjectUpdateSchema,
  workSendMessageSchema,
  workSessionCreateSchema,
  workSessionUpdateSchema,
} from "@/lib/validation";

async function uniqueProjectSlug(
  workflowId: string,
  base: string,
): Promise<string> {
  let slug = slugify(base);
  let n = 1;
  while (
    await db.workProject.findUnique({
      where: { workflowId_slug: { workflowId, slug } },
    })
  ) {
    slug = `${slugify(base)}-${++n}`;
  }
  return slug;
}

export async function createWorkProject(input: unknown) {
  const data = workProjectCreateSchema.parse(input);
  const slug = await uniqueProjectSlug(data.workflowId, data.name);

  const project = await db.workProject.create({
    data: {
      workflowId: data.workflowId,
      name: data.name,
      slug,
      instruction: data.instruction ?? "",
      defaultModel: data.defaultModel ?? null,
    },
  });

  revalidatePath("/work");
  return { id: project.id };
}

export async function updateWorkProject(input: unknown) {
  const data = workProjectUpdateSchema.parse(input);
  const { id, ...rest } = data;
  // Touching updatedAt is what tells a running session its brief moved — the
  // executor restates the instruction when the project changed after the last
  // turn, so an edit lands on the next message rather than the next session.
  await db.workProject.update({
    where: { id },
    data: { ...rest, updatedAt: new Date() },
  });
  revalidatePath("/work");
  revalidatePath(`/work/p/${id}/instruction`);
}

export async function deleteWorkProject(id: string) {
  // Sessions cascade with the project, but their hidden Tasks do not — the FK
  // points the other way. Drop the tasks first so runs, events, and artifacts go
  // with them, then let the cascade clear the sessions.
  const sessions = await db.workSession.findMany({
    where: { projectId: id },
    select: { taskId: true, assetFolderId: true, engineSessionId: true },
  });
  await purgeSessionSideEffects(sessions);

  // The library belongs to the project, so it goes too. The FK is SetNull, which
  // would otherwise leave an orphan folder listed under the workflow.
  const project = await db.workProject.findUnique({
    where: { id },
    select: { assetFolder: { select: { id: true, relPath: true } } },
  });
  await db.workProject.delete({ where: { id } });
  if (project?.assetFolder) {
    await db.assetFolder.delete({ where: { id: project.assetFolder.id } });
    await storage.deletePrefix(project.assetFolder.relPath).catch(() => {});
  }

  revalidatePath("/work");
}

/**
 * Create a session plus the hidden Task its turns run as. The task carries the
 * project's model/provider so the executor's normal resolution chain applies.
 */
export async function createWorkSession(input: unknown) {
  const data = workSessionCreateSchema.parse(input);
  const project = await db.workProject.findUniqueOrThrow({
    where: { id: data.projectId },
  });
  const title = data.title ?? "New session";

  const task = await db.task.create({
    data: {
      workflowId: project.workflowId,
      name: `Work · ${project.name} · ${title}`,
      instruction: "",
      model: project.defaultModel,
      provider: project.provider,
      // Work turns are driven by the conversation, never by a schedule.
      enabled: false,
    },
  });

  const session = await db.workSession.create({
    data: {
      projectId: project.id,
      title,
      taskId: task.id,
      model: project.defaultModel,
    },
  });

  revalidatePath("/work");
  return { id: session.id };
}

export async function updateWorkSession(input: unknown) {
  const data = workSessionUpdateSchema.parse(input);
  const { id, ...rest } = data;
  const session = await db.workSession.update({ where: { id }, data: rest });
  if (rest.model !== undefined) {
    await db.task.update({
      where: { id: session.taskId },
      data: { model: rest.model },
    });
  }
  revalidatePath("/work");
  revalidatePath(`/work/${id}`);
}

export async function deleteWorkSession(id: string) {
  const session = await db.workSession.findUniqueOrThrow({ where: { id } });
  await purgeSessionSideEffects([session]);
  revalidatePath("/work");
}

/**
 * Remove what a session owns outside its own row: rendered outputs, the hidden
 * Task (whose cascade takes runs/events/artifacts and the session itself), and
 * the folder of images pasted into the conversation.
 */
async function purgeSessionSideEffects(
  sessions: {
    taskId: string;
    assetFolderId: string | null;
    engineSessionId?: string | null;
  }[],
): Promise<void> {
  if (sessions.length === 0) return;
  const taskIds = sessions.map((s) => s.taskId);

  await removeTaskOutputs(taskIds);

  // The OpenAI-compatible engine stores its conversation in our own table
  // rather than inside a CLI, so nothing else would ever clean it up.
  const engineSessionIds = sessions
    .map((s) => s.engineSessionId)
    .filter((id): id is string => Boolean(id));
  if (engineSessionIds.length > 0) {
    await db.agentTranscript.deleteMany({
      where: { id: { in: engineSessionIds } },
    });
  }

  const folderIds = sessions
    .map((s) => s.assetFolderId)
    .filter((f): f is string => Boolean(f));
  if (folderIds.length > 0) {
    const folders = await db.assetFolder.findMany({
      where: { id: { in: folderIds } },
      select: { id: true, relPath: true },
    });
    await db.assetFolder.deleteMany({ where: { id: { in: folderIds } } });
    await Promise.all(
      folders.map((f) => storage.deletePrefix(f.relPath).catch(() => {})),
    );
  }

  await db.task.deleteMany({ where: { id: { in: taskIds } } });
}

/** First line of a message, trimmed — good enough to name a session by. */
function titleFromMessage(text: string): string {
  const line = text.split("\n")[0].trim().replace(/\s+/g, " ");
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || "New session";
}

/**
 * Record a user turn and queue the agent run that answers it. Returns the run id
 * so the client can stream it over the existing /api/runs/[id]/stream route.
 */
export async function sendWorkMessage(input: unknown) {
  const data = workSendMessageSchema.parse(input);
  const session = await db.workSession.findUniqueOrThrow({
    where: { id: data.sessionId },
    include: {
      _count: { select: { messages: true } },
      messages: { select: { attachments: true } },
    },
  });

  // The tray keeps every image of the session, so a later turn would repeat
  // pictures an earlier bubble already shows. Record only what is new here.
  const alreadySent = new Set(
    session.messages.flatMap((m) =>
      Array.isArray(m.attachments)
        ? (m.attachments as { assetId?: string }[]).map((a) => a.assetId ?? "")
        : [],
    ),
  );
  const attachments = data.attachments.filter(
    (a) => !alreadySent.has(a.assetId),
  );

  const run = await db.taskRun.create({
    data: {
      taskId: session.taskId,
      status: "QUEUED",
      trigger: "work",
      model: session.model,
    },
  });

  const message = await db.workMessage.create({
    data: {
      sessionId: session.id,
      text: data.text,
      mentions: data.mentions,
      attachments,
      researchMode: data.researchMode,
      browseWeb: data.browseWeb,
      taskRunId: run.id,
    },
  });

  // Name the session after its opening message, once.
  if (session._count.messages === 0 && session.title === "New session") {
    const title = titleFromMessage(data.text);
    await db.workSession.update({
      where: { id: session.id },
      data: { title },
    });
    await db.task.update({
      where: { id: session.taskId },
      data: { name: `Work · ${title}` },
    });
  }

  enqueueWorkTurn(run.id);

  revalidatePath("/work");
  revalidatePath(`/work/${session.id}`);
  // `attachments` goes back deduped so the optimistic bubble matches the row.
  return { runId: run.id, messageId: message.id, attachments };
}

/**
 * Images the `@` menu can offer: this session's uploads first, then the renders
 * this project already produced (pointing at one asks for a revision), then
 * anything mentionable from the workflow — its other asset folders and its
 * global bank. Ranked with the same keyword pass the run tools use.
 */
export async function listMentionCandidates(
  sessionId: string,
  query: string,
): Promise<WorkAttachment[]> {
  const session = await db.workSession.findUnique({
    where: { id: sessionId },
    include: { project: { select: { workflowId: true } } },
  });
  if (!session) return [];

  const [folderAssets, globalAssets, renders] = await Promise.all([
    db.asset.findMany({
      where: { folder: { workflowId: session.project.workflowId } },
      orderBy: { createdAt: "asc" },
    }),
    db.workflowAsset.findMany({
      where: { workflowId: session.project.workflowId },
      orderBy: { createdAt: "asc" },
    }),
    listProjectRenders(session.projectId, sessionId),
  ]);

  // `filename` is what the ranker scores against; the rest is the view model.
  type Candidate = WorkAttachment & {
    filename: string;
    description: string;
    tags: string[];
  };

  const rows: Candidate[] = [
    ...folderAssets.map((a) => ({
      id: a.id,
      name: a.filename,
      filename: a.filename,
      url: mediaUrl(a.relPath),
      relPath: a.relPath,
      origin:
        a.folderId === session.assetFolderId
          ? ("session" as const)
          : ("folder" as const),
      description: a.description,
      tags: a.tags,
    })),
    ...globalAssets.map((a) => ({
      id: a.id,
      name: a.filename,
      filename: a.filename,
      url: mediaUrl(a.relPath),
      relPath: a.relPath,
      origin: "global" as const,
      description: a.description,
      tags: [] as string[],
    })),
    // A render's "description" is the session it came from, so typing part of a
    // session title finds the slides it produced.
    ...renders.map((r) => ({
      ...r,
      filename: r.name,
      description: r.sourceLabel ?? "",
      tags: [] as string[],
    })),
  ];

  const strip = ({
    id,
    name,
    url,
    relPath,
    origin,
    sourceLabel,
  }: Candidate) => ({
    id,
    name,
    url,
    relPath,
    origin,
    ...(sourceLabel ? { sourceLabel } : {}),
  });

  // Session uploads are what the user just pasted — always show them first, then
  // the renders (revising one is the other common reason to reach for `@`).
  const sessionRows = rows.filter((r) => r.origin === "session");
  const renderRows = rows.filter((r) => r.origin === "render");
  const rest = rows.filter(
    (r) => r.origin !== "session" && r.origin !== "render",
  );
  const needle = query.trim().toLowerCase();

  // With nothing typed, `@` is a browser: recent pastes, recent renders, then
  // the banks ranked by the semantic pass.
  if (!needle) {
    return [
      ...sessionRows,
      ...renderRows.slice(0, 8),
      ...rankAssets(query, rest, 12),
    ].map(strip);
  }

  // With something typed it is a typeahead over names, so match the name the
  // way the user is spelling it. The semantic ranker tokenizes and drops short
  // or stop-word terms — "image-1" reduces to nothing under it — so it can only
  // serve as the tiebreak for description and tag hits, never as the filter.
  function affinity(row: Candidate): number {
    const name = row.name.toLowerCase();
    if (name.startsWith(needle)) return 3;
    if (name.includes(needle)) return 2;
    const haystack = `${row.description} ${row.tags.join(" ")}`.toLowerCase();
    return haystack.includes(needle) ? 1 : 0;
  }

  return rows
    .map((row, i) => ({ row, i, score: affinity(row) }))
    .filter((entry) => entry.score > 0)
    // Best name match first, session uploads ahead of the banks on a tie, then
    // original order so the list never reshuffles between keystrokes.
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.row.origin === "session") - Number(a.row.origin === "session") ||
        a.i - b.i,
    )
    .slice(0, 12)
    .map((entry) => strip(entry.row));
}

/**
 * PNGs this project has already rendered, newest first, with this session's own
 * output ahead of the rest. Pointing at one of these is a revision request, so
 * only the newest write of a path is offered — an earlier render of the same
 * filename has been overwritten on disk and no longer exists to revise.
 */
async function listProjectRenders(
  projectId: string,
  sessionId: string,
): Promise<WorkAttachment[]> {
  const rows = await db.runArtifact.findMany({
    where: { kind: "PNG", taskRun: { task: { workSession: { projectId } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      filename: true,
      relPath: true,
      taskRun: {
        select: {
          task: {
            select: { workSession: { select: { id: true, title: true } } },
          },
        },
      },
    },
  });

  const byPath = new Map<string, WorkAttachment & { ownSession: boolean }>();
  for (const row of rows) {
    if (byPath.has(row.relPath)) continue;
    const from = row.taskRun.task.workSession;
    byPath.set(row.relPath, {
      id: row.id,
      name: row.filename,
      url: mediaUrl(row.relPath),
      relPath: row.relPath,
      origin: "render",
      sourceLabel: from?.title ?? "",
      ownSession: from?.id === sessionId,
    });
  }

  return [...byPath.values()]
    .sort((a, b) => Number(b.ownSession) - Number(a.ownSession))
    .slice(0, 60)
    .map(({ ownSession: _ownSession, ...rest }) => rest);
}

/**
 * Skills the `/` menu can offer. Mirrors what the executor actually loads: the
 * workflow's assigned skills, or the whole enabled bank when it has assigned
 * none. Filtered on slug and name, since `/` is a typeahead over the handle.
 */
export async function listSkillCandidates(
  sessionId: string,
  query: string,
): Promise<WorkSkillOption[]> {
  const session = await db.workSession.findUnique({
    where: { id: sessionId },
    include: { project: { select: { workflowId: true } } },
  });
  if (!session) return [];

  const [assigned, bank] = await Promise.all([
    db.workflowSkill.findMany({
      where: { workflowId: session.project.workflowId },
      include: { skill: true },
    }),
    db.skill.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
  ]);

  const assignedIds = new Set(
    assigned.filter((w) => w.skill.enabled).map((w) => w.skillId),
  );
  // No assignment means the workflow runs with the whole bank available.
  const rows = (
    assignedIds.size > 0 ? bank.filter((s) => assignedIds.has(s.id)) : bank
  ).map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    assigned: assignedIds.has(s.id),
  }));

  const needle = query.trim().toLowerCase();
  if (!needle) return rows.slice(0, 12);

  return rows
    .map((row, i) => {
      const slug = row.slug.toLowerCase();
      const score = slug.startsWith(needle)
        ? 3
        : slug.includes(needle)
          ? 2
          : `${row.name} ${row.description}`.toLowerCase().includes(needle)
            ? 1
            : 0;
      return { row, i, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 12)
    .map((entry) => entry.row);
}

/**
 * The project's own image library, created on first use. This is what the agent
 * searches when it needs a picture it was not handed — each asset carries a
 * "use this when…" description, so the ranker can match it to a brief.
 */
export async function ensureProjectAssetFolder(
  projectId: string,
): Promise<{ id: string; relPath: string }> {
  const folder = await ensureProjectAssetFolderRow(projectId);
  revalidatePath(`/work/p/${projectId}/assets`);
  return folder;
}

/**
 * The folder a session's pasted images live in, created on first use. Sessions
 * without one have never received an upload.
 */
export async function ensureSessionAssetFolder(
  sessionId: string,
): Promise<{ id: string; relPath: string }> {
  const session = await db.workSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      assetFolder: true,
      project: { include: { workflow: true } },
    },
  });
  if (session.assetFolder) {
    return {
      id: session.assetFolder.id,
      relPath: session.assetFolder.relPath,
    };
  }

  const workflow = session.project.workflow;
  const slug = `work-${slugify(`${session.project.slug}-${session.id.slice(-6)}`)}`;
  const relPath = path.join("data", "assets", workflow.slug, slug);
  await storage.ensurePrefix(relPath);

  const folder = await db.assetFolder.create({
    data: {
      workflowId: workflow.id,
      name: `Work · ${session.title}`,
      slug,
      relPath,
      notes: "Images pasted into a Work session.",
    },
  });
  await db.workSession.update({
    where: { id: sessionId },
    data: { assetFolderId: folder.id },
  });

  return { id: folder.id, relPath: folder.relPath };
}
