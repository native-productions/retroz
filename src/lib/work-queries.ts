import { db } from "@/lib/db-client";
import { mediaUrl } from "@/lib/media";
import {
  eventsToMessages,
  planFromEvents,
  timeLabel,
  type WorkEvent,
} from "@/lib/work-events";
import type { ResearchMode } from "@/lib/research";
import type {
  WorkAccent,
  WorkAttachment,
  WorkMention,
  WorkMessage,
  WorkPlanStep,
  WorkProject,
  WorkResult,
  WorkSession,
  WorkSessionStatus,
} from "@/lib/work-types";

// Read side of the Work playground: Prisma rows in, view models out. Everything
// date-shaped is formatted here so the client renders exactly what was sent.

export const ACCENTS: WorkAccent[] = ["primary", "secondary", "accent"];

/** Two-letter tile from a project name: "Native Academy" → "NA". */
export function projectCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Rail grouping + label, resolved on the server against its local clock. */
export function describeWhen(
  at: Date,
): Pick<WorkSession, "bucket" | "updatedLabel"> {
  const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);

  if (days <= 0) {
    const mins = Math.floor((now.getTime() - at.getTime()) / 60_000);
    if (mins < 1) return { bucket: "Today", updatedLabel: "just now" };
    if (mins < 60) return { bucket: "Today", updatedLabel: `${mins}m ago` };
    return { bucket: "Today", updatedLabel: `${Math.floor(mins / 60)}h ago` };
  }
  if (days === 1) {
    return { bucket: "Yesterday", updatedLabel: `Yesterday, ${timeLabel(at.toISOString())}` };
  }
  return {
    bucket: "Earlier",
    updatedLabel: at.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
  };
}

function statusOfRun(status?: string | null): WorkSessionStatus {
  if (status === "QUEUED" || status === "RUNNING") return "running";
  if (status === "FAILED") return "error";
  return "idle";
}

export async function listWorkProjects(): Promise<WorkProject[]> {
  const rows = await db.workProject.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { sessions: true, bundles: true } },
      assetFolder: { select: { _count: { select: { assets: true } } } },
      sessions: {
        where: { archived: false },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  // One indexed count per project. There are only ever a handful of projects,
  // so this stays cheaper than pulling every artifact row back to group it.
  const renderCounts = await Promise.all(
    rows.map((p) =>
      db.runArtifact.count({
        where: {
          kind: "PNG",
          taskRun: { task: { workSession: { projectId: p.id } } },
        },
      }),
    ),
  );

  return rows.map((p, i) => ({
    id: p.id,
    name: p.name,
    code: projectCode(p.name),
    accent: ACCENTS[i % ACCENTS.length],
    sessionCount: p._count.sessions,
    renderCount: renderCounts[i],
    bundleCount: p._count.bundles,
    assetCount: p.assetFolder?._count.assets ?? 0,
    chatSessionId: p.sessions[0]?.id ?? null,
  }));
}

export async function listWorkSessions(): Promise<WorkSession[]> {
  const rows = await db.workSession.findMany({
    where: { archived: false },
    orderBy: { updatedAt: "desc" },
    include: {
      task: {
        select: {
          runs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true },
          },
        },
      },
    },
  });

  return rows.map((s) => ({
    id: s.id,
    projectId: s.projectId,
    title: s.title,
    status: statusOfRun(s.task.runs[0]?.status),
    ...describeWhen(s.updatedAt),
  }));
}

export interface WorkSessionDetail {
  id: string;
  projectId: string;
  title: string;
  model: string | null;
  /** Locked render shape, null when the agent picks per image. */
  aspectRatio: string | null;
  /** Research choice of the last turn — the composer reopens on it, so the
   *  setting feels sticky without being a session-level column. */
  researchMode: ResearchMode;
  status: WorkSessionStatus;
  /** The turn still in flight, if any — the client streams this one. */
  liveRunId: string | null;
  messages: WorkMessage[];
  attachments: WorkAttachment[];
  results: WorkResult[];
  plan: WorkPlanStep[];
}

/**
 * Everything the three panes need for one session: the conversation (user
 * messages interleaved with each turn's run events), the pasted images, the
 * renders produced so far, and the agent's current plan.
 */
export async function getWorkSessionDetail(
  sessionId: string,
): Promise<WorkSessionDetail | null> {
  const session = await db.workSession.findUnique({
    where: { id: sessionId },
    include: {
      assetFolder: { include: { assets: { orderBy: { createdAt: "asc" } } } },
      messages: { orderBy: { createdAt: "asc" } },
      task: {
        select: {
          runs: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              status: true,
              events: { orderBy: { seq: "asc" } },
              artifacts: { orderBy: { createdAt: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!session) return null;

  const runs = session.task.runs;
  const runById = new Map(runs.map((r) => [r.id, r]));
  const liveRun = runs.find(
    (r) => r.status === "QUEUED" || r.status === "RUNNING",
  );

  // Conversation: each user message, then the events of the run it started.
  const messages: WorkMessage[] = [];
  for (const message of session.messages) {
    messages.push({
      id: message.id,
      role: "user",
      timeLabel: timeLabel(message.createdAt.toISOString()),
      text: message.text,
      mentions: (message.mentions as WorkMention[] | null) ?? [],
      runId: message.taskRunId,
    });

    const run = message.taskRunId ? runById.get(message.taskRunId) : undefined;
    if (!run) continue;
    messages.push(
      ...eventsToMessages(run.id, run.events.map(toWorkEvent)),
    );
  }

  // Renders: newest write of each path wins — re-rendering a filename replaces
  // the image on disk, so the older RunArtifact row is stale.
  const byPath = new Map<string, WorkResult>();
  for (const run of runs) {
    for (const a of run.artifacts) {
      byPath.set(a.relPath, {
        id: a.id,
        filename: a.filename,
        relPath: a.relPath,
        url: mediaUrl(a.relPath),
        sizeLabel: a.width && a.height ? `${a.width} × ${a.height}` : "",
      });
    }
  }

  const lastRun = runs[runs.length - 1];
  const plan = lastRun
    ? planFromEvents(lastRun.events.map(toWorkEvent))
    : [];

  return {
    id: session.id,
    projectId: session.projectId,
    title: session.title,
    model: session.model,
    aspectRatio: session.aspectRatio,
    researchMode:
      session.messages.at(-1)?.researchMode ?? ("AUTO" as ResearchMode),
    status: statusOfRun(lastRun?.status),
    liveRunId: liveRun?.id ?? null,
    messages,
    attachments: (session.assetFolder?.assets ?? []).map((a) => ({
      id: a.id,
      name: a.filename,
      relPath: a.relPath,
      url: mediaUrl(a.relPath),
      origin: "session" as const,
    })),
    results: [...byPath.values()],
    plan,
  };
}

function toWorkEvent(e: {
  seq: number;
  type: string;
  payload: unknown;
  ts: Date;
}): WorkEvent {
  return {
    seq: e.seq,
    type: e.type as WorkEvent["type"],
    payload: e.payload,
    ts: e.ts.toISOString(),
  };
}

/** Newest session overall — where bare `/work` lands. */
export async function newestWorkSessionId(): Promise<string | null> {
  const row = await db.workSession.findFirst({
    where: { archived: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Workflows offered when creating a project. */
export async function listWorkflowOptions() {
  return db.workflow.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
