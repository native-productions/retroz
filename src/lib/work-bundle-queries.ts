import { db } from "@/lib/db-client";
import { mediaUrl } from "@/lib/media";
import { describeWhen, startOfDay } from "@/lib/work-queries";
import type {
  WorkBundleDetail,
  WorkBundleSummary,
  WorkRender,
} from "@/lib/work-types";

// Read side of the project-scoped Work surfaces: the gallery of every render a
// project has produced, and the bundles assembled out of it. Same contract as
// `work-queries.ts` — Prisma rows in, fully formatted view models out, so no
// date or byte formatting can drift between the server and client render.

/** Greatest common divisor, for reducing 1080×1350 to 4:5. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The bucket the aspect-ratio guard compares slides on. Reduced when it lands
 * on a small whole-number ratio (4:5, 1:1, 9:16) and rounded to two decimals
 * otherwise, so 1080×1349 and 1080×1350 do not read as different formats.
 */
export function ratioOf(width: number | null, height: number | null): string {
  if (!width || !height) return "";
  const divisor = gcd(width, height);
  const w = width / divisor;
  const h = height / divisor;
  if (w <= 32 && h <= 32) return `${w}:${h}`;
  return (width / height).toFixed(2);
}

function sizeLabel(width: number | null, height: number | null): string {
  return width && height ? `${width} × ${height}` : "";
}

function weightLabel(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Gallery day heading: "Today", "Yesterday", then "Mon, 21 Jul". */
function describeDay(at: Date): { day: string; dayLabel: string } {
  const days = Math.round((startOfDay(new Date()) - startOfDay(at)) / 86_400_000);
  const day = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("-");

  if (days <= 0) return { day, dayLabel: "Today" };
  if (days === 1) return { day, dayLabel: "Yesterday" };
  return {
    day,
    dayLabel: at.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
  };
}

type ArtifactRow = {
  id: string;
  filename: string;
  relPath: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  createdAt: Date;
  taskRun: {
    task: { workSession: { id: string; title: string } | null };
  };
};

const ARTIFACT_SELECT = {
  id: true,
  filename: true,
  relPath: true,
  width: true,
  height: true,
  bytes: true,
  createdAt: true,
  taskRun: {
    select: {
      task: {
        select: { workSession: { select: { id: true, title: true } } },
      },
    },
  },
} as const;

function toRender(row: ArtifactRow): WorkRender {
  const session = row.taskRun.task.workSession;
  return {
    id: row.id,
    filename: row.filename,
    relPath: row.relPath,
    url: mediaUrl(row.relPath),
    width: row.width,
    height: row.height,
    sizeLabel: sizeLabel(row.width, row.height),
    weightLabel: weightLabel(row.bytes),
    ratio: ratioOf(row.width, row.height),
    sessionId: session?.id ?? "",
    sessionTitle: session?.title ?? "Unknown session",
    ...describeDay(row.createdAt),
  };
}

/**
 * Every PNG the project has rendered, newest first. Deduped by `relPath` the
 * same way `getWorkSessionDetail` does it: re-rendering a filename overwrites
 * the file on disk, so only the newest RunArtifact row for a path is real.
 */
export async function listProjectRenders(
  projectId: string,
): Promise<WorkRender[]> {
  const rows = await db.runArtifact.findMany({
    where: {
      kind: "PNG",
      taskRun: { task: { workSession: { projectId } } },
    },
    orderBy: { createdAt: "desc" },
    select: ARTIFACT_SELECT,
  });

  const seen = new Set<string>();
  const renders: WorkRender[] = [];
  for (const row of rows) {
    if (seen.has(row.relPath)) continue;
    seen.add(row.relPath);
    renders.push(toRender(row));
  }
  return renders;
}

/** The ratio most slides share, plus whether any slide breaks it. */
export function majorityRatio(ratios: string[]): {
  ratio: string;
  mixed: boolean;
} {
  const counts = new Map<string, number>();
  for (const r of ratios) {
    if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let ratio = "";
  let best = 0;
  for (const [value, count] of counts) {
    if (count > best) {
      ratio = value;
      best = count;
    }
  }
  return { ratio, mixed: ratio !== "" && best < ratios.length };
}

export async function listWorkBundles(
  projectId: string,
): Promise<WorkBundleSummary[]> {
  const rows = await db.workBundle.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: {
      items: {
        orderBy: { order: "asc" },
        select: {
          artifact: {
            select: { id: true, relPath: true, width: true, height: true },
          },
        },
      },
    },
  });

  return rows.map((bundle) => {
    const artifacts = bundle.items.map((i) => i.artifact);
    const { ratio, mixed } = majorityRatio(
      artifacts.map((a) => ratioOf(a.width, a.height)),
    );
    return {
      id: bundle.id,
      name: bundle.name,
      count: artifacts.length,
      covers: artifacts.slice(0, 3).map((a) => ({
        id: a.id,
        url: mediaUrl(a.relPath),
      })),
      ratio,
      mixedRatio: mixed,
      updatedLabel: describeWhen(bundle.updatedAt).updatedLabel,
    };
  });
}

export async function getWorkBundle(
  bundleId: string,
): Promise<WorkBundleDetail | null> {
  const bundle = await db.workBundle.findUnique({
    where: { id: bundleId },
    include: {
      items: {
        orderBy: { order: "asc" },
        select: { id: true, artifact: { select: ARTIFACT_SELECT } },
      },
    },
  });
  if (!bundle) return null;

  const items = bundle.items.map((item) => ({
    id: item.id,
    render: toRender(item.artifact),
  }));

  return {
    id: bundle.id,
    projectId: bundle.projectId,
    name: bundle.name,
    note: bundle.note,
    items,
    ratio: majorityRatio(items.map((i) => i.render.ratio)).ratio,
    updatedLabel: describeWhen(bundle.updatedAt).updatedLabel,
  };
}
