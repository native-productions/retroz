import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { db } from "@/lib/db-client";
import type { RunWorkspace } from "@/lib/run-workspace";

// Revising a finished PNG. Every render stores the HTML that produced it
// (`RenderSource`), so a slide made months ago can be edited instead of rebuilt
// from a description of itself.

/** One render the current turn pointed at with `@`. */
export interface RevisionTarget {
  filename: string;
  /** Local copy of the PNG, so the agent can look at what is wrong. */
  pngAbsPath: string;
  /** The stored document, rehomed onto this run's paths. Null when none was kept. */
  htmlAbsPath: string | null;
  width: number | null;
  height: number | null;
  /** Session that produced it — the same filename recurs across sessions. */
  sessionTitle: string;
  /** True when the render came from a different session than the one revising. */
  foreign: boolean;
  /** Photo references the rehome pass could not match to a staged asset. */
  unresolved: string[];
}

/** Image references worth rewriting; everything else is left untouched. */
const PATH_RE =
  /(?:file:\/\/)?\/[^\s"'()<>]*\.(?:png|jpe?g|webp|gif|svg|avif)/gi;

/**
 * Point a stored document at this run's copies of its photos.
 *
 * The absolute paths baked into the HTML belonged to the workspace of the run
 * that wrote it — a temp directory deleted when that run ended. Re-rendering it
 * untouched would silently lose every photo (the layout audit would reject the
 * frame, which is better than shipping it, but the agent would have no idea
 * why). Matching is by basename: the same asset hydrates under a different
 * absolute path on every run, but keeps its filename.
 */
export function rehomeImagePaths(
  html: string,
  assets: { filename: string; absPath: string }[],
): { html: string; unresolved: string[] } {
  const byName = new Map(assets.map((a) => [a.filename.toLowerCase(), a.absPath]));
  const unresolved = new Set<string>();

  const next = html.replace(PATH_RE, (match, offset: number) => {
    // A remote image is not a stale local path: `https://host/x.png` matches from
    // the slash after the scheme, and `//host/x.png` is protocol-relative. Both
    // still load, so leave them alone and do not report them as broken.
    const isRemote = !match.startsWith("file://") &&
      (match.startsWith("//") || html[offset - 1] === ":");
    if (isRemote) return match;

    // Percent-encoding survives in file:// URLs ("my%20photo.png").
    let basename = path.posix.basename(match.replace(/^file:\/\//, ""));
    try {
      basename = decodeURIComponent(basename);
    } catch {
      // Malformed escapes: fall back to the raw basename.
    }
    const absPath = byName.get(basename.toLowerCase());
    if (!absPath) {
      unresolved.add(basename);
      return match;
    }
    return pathToFileURL(absPath).href;
  });

  return { html: next, unresolved: [...unresolved] };
}

/**
 * Put the PNG and its source document on disk for every render this turn wants
 * revised. The HTML goes to a scratch directory rather than the output folder:
 * only the output folder is published on close, and a session's gallery should
 * hold rendered images, not working files.
 */
export async function stageRevisions(opts: {
  artifactIds: string[];
  sessionId: string;
  workspace: RunWorkspace;
  assets: { filename: string; absPath: string }[];
}): Promise<RevisionTarget[]> {
  const { artifactIds, sessionId, workspace, assets } = opts;
  if (artifactIds.length === 0) return [];

  const rows = await db.runArtifact.findMany({
    where: { id: { in: artifactIds }, kind: "PNG" },
    select: {
      id: true,
      filename: true,
      relPath: true,
      width: true,
      height: true,
      source: { select: { html: true, width: true, height: true } },
      taskRun: {
        select: {
          task: {
            select: { workSession: { select: { id: true, title: true } } },
          },
        },
      },
    },
  });
  if (rows.length === 0) return [];

  // Mentions arrive in the order they were typed; the query does not preserve it.
  const order = new Map(artifactIds.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const pngPaths = await workspace.files(
    rows.map((r) => r.relPath),
    "renders",
  );
  const htmlDir = await workspace.scratch("revise");

  const targets: RevisionTarget[] = [];
  for (const row of rows) {
    const pngAbsPath = pngPaths.get(row.relPath);
    // A missing file means the storage object is gone; the row outliving its
    // bytes is not worth failing the turn over.
    if (!pngAbsPath) continue;

    const from = row.taskRun.task.workSession;
    let htmlAbsPath: string | null = null;
    let unresolved: string[] = [];

    if (row.source) {
      const rehomed = rehomeImagePaths(row.source.html, assets);
      unresolved = rehomed.unresolved;
      htmlAbsPath = path.join(
        htmlDir,
        `${row.filename.replace(/\.png$/i, "")}.html`,
      );
      await fs.writeFile(htmlAbsPath, rehomed.html, "utf8");
    }

    targets.push({
      filename: row.filename,
      pngAbsPath,
      htmlAbsPath,
      width: row.source?.width ?? row.width,
      height: row.source?.height ?? row.height,
      sessionTitle: from?.title ?? "",
      foreign: from?.id !== sessionId,
      unresolved,
    });
  }

  return targets;
}
