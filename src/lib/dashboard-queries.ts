import { subDays } from "date-fns";
import { db } from "@/lib/db-client";
import { mediaUrl } from "@/lib/media";
import { providerLabel } from "@/lib/models";
import type { AgentProvider } from "@/generated/prisma/enums";

// Read side of the dashboard. Every panel's view model is assembled here so the
// page itself stays composition, and so date formatting happens once on the
// server instead of drifting between server and client render.

/** How many days of engine usage the token chart covers. */
const TOKEN_WINDOW_DAYS = 14;
/** Contact-sheet cap. Retina PNGs are heavy; this is a deliberate ceiling. */
const GALLERY_LIMIT = 24;

export interface DashCounter {
  key: string;
  label: string;
  value: number;
  href: string;
  /** Which brand block this cell wears. */
  tone: "primary" | "secondary" | "accent" | "surface";
  /** Flex weight, so the strip reads as an index rather than a card grid. */
  span: number;
}

export interface DashGalleryItem {
  id: string;
  filename: string;
  relPath: string;
  url: string;
  /** Where it came from, for the caption. */
  origin: string;
  originKind: "work" | "run";
  href: string;
}

export interface DashTokenDay {
  /** ISO date, `YYYY-MM-DD`. */
  day: string;
  /** Short label for the axis, e.g. "18/7". */
  label: string;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  costUsd: number;
}

export interface DashTokenFacet {
  provider: AgentProvider;
  label: string;
  days: DashTokenDay[];
  totalIn: number;
  totalOut: number;
  costUsd: number;
}

export interface DashWorkflowRuns {
  id: string;
  name: string;
  done: number;
  failed: number;
  cancelled: number;
  total: number;
}

export interface DashRecentSession {
  id: string;
  title: string;
  projectName: string;
  status: "idle" | "running" | "error";
  when: string;
}

export interface DashRecentWorkflow {
  id: string;
  name: string;
  platform: string;
  tasks: number;
  campaigns: number;
}

export interface DashRecentCampaign {
  id: string;
  name: string;
  status: string;
  workflowName: string;
  items: number;
}

export interface DashRecentRun {
  id: string;
  taskName: string;
  workflowName: string;
  status: string;
  when: string;
}

export interface DashboardData {
  runsToday: number;
  counters: DashCounter[];
  gallery: DashGalleryItem[];
  tokens: DashTokenFacet[];
  workflowRuns: DashWorkflowRuns[];
  sessions: DashRecentSession[];
  workflows: DashRecentWorkflow[];
  campaigns: DashRecentCampaign[];
  runs: DashRecentRun[];
}

/** "18 Jul, 21:40" — one format for every timestamp on the page. */
function stamp(at: Date): string {
  return at.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayKey(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

function dayLabel(at: Date): string {
  return `${at.getDate()}/${at.getMonth() + 1}`;
}

/**
 * One query pass for the whole page. Work-session tasks and their turns are
 * excluded from the production counters and the run panels — they are
 * conversation, not scheduled output — but their rendered PNGs still belong in
 * the gallery, which is about what the app produced, whatever produced it.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const since = subDays(new Date(), TOKEN_WINDOW_DAYS - 1);
  since.setHours(0, 0, 0, 0);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const [
    runsToday,
    workflowCount,
    projectCount,
    taskCount,
    runCount,
    assetCount,
    fontCount,
    skillCount,
    artifacts,
    taskUsage,
    plannerUsage,
    runStatuses,
    workflowRows,
    sessionRows,
    campaignRows,
    runRows,
  ] = await Promise.all([
    // Work turns count here: "what ran today" means every agent spawn.
    db.taskRun.count({ where: { createdAt: { gte: midnight } } }),
    db.workflow.count(),
    db.workProject.count(),
    db.task.count({ where: { workSession: null } }),
    db.taskRun.count({ where: { trigger: { not: "work" } } }),
    db.asset.count(),
    db.font.count(),
    db.skill.count(),

    db.runArtifact.findMany({
      where: { kind: "PNG" },
      orderBy: { createdAt: "desc" },
      take: GALLERY_LIMIT,
      select: {
        id: true,
        filename: true,
        relPath: true,
        taskRun: {
          select: {
            id: true,
            task: {
              select: {
                workflow: { select: { name: true } },
                workSession: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    }),

    db.taskRun.findMany({
      where: { createdAt: { gte: since } },
      select: {
        createdAt: true,
        provider: true,
        tokensIn: true,
        tokensOut: true,
        cacheReadTokens: true,
        costUsd: true,
      },
    }),
    db.campaignPlanRun.findMany({
      where: { createdAt: { gte: since } },
      select: {
        createdAt: true,
        provider: true,
        tokensIn: true,
        tokensOut: true,
        cacheReadTokens: true,
        costUsd: true,
      },
    }),

    db.taskRun.findMany({
      where: { trigger: { not: "work" } },
      select: { status: true, task: { select: { workflowId: true } } },
    }),

    db.workflow.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        platform: true,
        _count: {
          select: {
            tasks: { where: { workSession: null } },
            campaigns: true,
          },
        },
      },
    }),

    db.workSession.findMany({
      where: { archived: false },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        project: { select: { name: true } },
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
    }),

    db.campaign.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        workflow: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),

    db.taskRun.findMany({
      where: { trigger: { not: "work" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        status: true,
        createdAt: true,
        task: {
          select: { name: true, workflow: { select: { name: true } } },
        },
      },
    }),
  ]);

  // --- counters: unequal spans so the strip reads as an index -------------
  const counters: DashCounter[] = [
    { key: "workflows", label: "Workflows", value: workflowCount, href: "/workflows", tone: "secondary", span: 5 },
    { key: "projects", label: "Work projects", value: projectCount, href: "/work", tone: "accent", span: 6 },
    { key: "tasks", label: "Tasks", value: taskCount, href: "/workflows", tone: "surface", span: 4 },
    { key: "runs", label: "Runs", value: runCount, href: "/workflows", tone: "primary", span: 4 },
    { key: "assets", label: "Assets", value: assetCount, href: "/workflows", tone: "surface", span: 4 },
    { key: "fonts", label: "Fonts", value: fontCount, href: "/fonts", tone: "surface", span: 3 },
    { key: "skills", label: "Skills", value: skillCount, href: "/skills", tone: "surface", span: 3 },
  ];

  // --- gallery ------------------------------------------------------------
  const gallery: DashGalleryItem[] = artifacts.map((a) => {
    const session = a.taskRun.task.workSession;
    return {
      id: a.id,
      filename: a.filename,
      relPath: a.relPath,
      url: mediaUrl(a.relPath, a.id),
      origin: session ? session.title : a.taskRun.task.workflow.name,
      originKind: session ? "work" : "run",
      href: session ? `/work/${session.id}` : `/runs/${a.taskRun.id}`,
    };
  });

  // --- token usage: one facet per engine that actually ran ----------------
  const days: { key: string; label: string }[] = [];
  for (let i = 0; i < TOKEN_WINDOW_DAYS; i++) {
    const at = subDays(new Date(), TOKEN_WINDOW_DAYS - 1 - i);
    days.push({ key: dayKey(at), label: dayLabel(at) });
  }

  const facets = new Map<AgentProvider, Map<string, DashTokenDay>>();
  const blankDay = (d: { key: string; label: string }): DashTokenDay => ({
    day: d.key,
    label: d.label,
    tokensIn: 0,
    tokensOut: 0,
    cacheRead: 0,
    costUsd: 0,
  });

  for (const row of [...taskUsage, ...plannerUsage]) {
    if (row.tokensIn === 0 && row.tokensOut === 0) continue;
    let facet = facets.get(row.provider);
    if (!facet) {
      facet = new Map(days.map((d) => [d.key, blankDay(d)]));
      facets.set(row.provider, facet);
    }
    const bucket = facet.get(dayKey(row.createdAt));
    if (!bucket) continue;
    bucket.tokensIn += row.tokensIn;
    bucket.tokensOut += row.tokensOut;
    bucket.cacheRead += row.cacheReadTokens;
    bucket.costUsd += row.costUsd;
  }

  const tokens: DashTokenFacet[] = [...facets.entries()]
    .map(([provider, byDay]) => {
      const list = days.map((d) => byDay.get(d.key)!);
      return {
        provider,
        label: providerLabel(provider),
        days: list,
        totalIn: list.reduce((n, d) => n + d.tokensIn, 0),
        totalOut: list.reduce((n, d) => n + d.tokensOut, 0),
        costUsd: list.reduce((n, d) => n + d.costUsd, 0),
      };
    })
    .sort((a, b) => b.totalIn + b.totalOut - (a.totalIn + a.totalOut));

  // --- runs by workflow ---------------------------------------------------
  const runsByWorkflow = new Map<string, DashWorkflowRuns>();
  for (const wf of workflowRows) {
    runsByWorkflow.set(wf.id, {
      id: wf.id,
      name: wf.name,
      done: 0,
      failed: 0,
      cancelled: 0,
      total: 0,
    });
  }
  for (const row of runStatuses) {
    const entry = runsByWorkflow.get(row.task.workflowId);
    if (!entry) continue;
    if (row.status === "DONE") entry.done++;
    else if (row.status === "FAILED") entry.failed++;
    else if (row.status === "CANCELLED") entry.cancelled++;
    else continue; // QUEUED / RUNNING are not outcomes yet
    entry.total++;
  }

  const workflowRuns = [...runsByWorkflow.values()]
    .filter((w) => w.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  // --- recent lists -------------------------------------------------------
  const sessions: DashRecentSession[] = sessionRows.map((s) => {
    const last = s.task.runs[0]?.status;
    return {
      id: s.id,
      title: s.title,
      projectName: s.project.name,
      status:
        last === "QUEUED" || last === "RUNNING"
          ? "running"
          : last === "FAILED"
            ? "error"
            : "idle",
      when: stamp(s.updatedAt),
    };
  });

  const workflows: DashRecentWorkflow[] = workflowRows.slice(0, 5).map((w) => ({
    id: w.id,
    name: w.name,
    platform: w.platform,
    tasks: w._count.tasks,
    campaigns: w._count.campaigns,
  }));

  const campaigns: DashRecentCampaign[] = campaignRows.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    workflowName: c.workflow.name,
    items: c._count.items,
  }));

  const runs: DashRecentRun[] = runRows.map((r) => ({
    id: r.id,
    taskName: r.task.name,
    workflowName: r.task.workflow.name,
    status: r.status,
    when: stamp(r.createdAt),
  }));

  return {
    runsToday,
    counters,
    gallery,
    tokens,
    workflowRuns,
    sessions,
    workflows,
    campaigns,
    runs,
  };
}
