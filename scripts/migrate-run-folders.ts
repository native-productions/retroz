/**
 * Rename existing run output folders to the slug style used for new runs:
 * "<task-name>-<YYYY-MM-DD>-<HHmm>", replacing the old
 * "Task Name | 2026-07-18 21.14" form.
 *
 *   bun run storage:migrate-runs            # dry run — prints the plan only
 *   bun run storage:migrate-runs -- --apply # move objects and update the database
 *
 * Runs against whichever store STORAGE_DRIVER points at. Objects are moved,
 * then TaskRun.outputRelPath and every RunArtifact.relPath are rewritten in one
 * transaction per run, so a failure mid-way leaves that run untouched.
 */
import path from "node:path";
import { db } from "@/lib/db-client";
import { runFolderSlug } from "@/lib/paths";
import { storage } from "@/lib/storage";

const apply = process.argv.includes("--apply");

async function main() {
  const runs = await db.taskRun.findMany({
    where: { outputRelPath: { not: null } },
    select: {
      id: true,
      outputRelPath: true,
      createdAt: true,
      startedAt: true,
      task: { select: { name: true } },
      artifacts: { select: { id: true, relPath: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`driver: ${storage.name}`);
  console.log(`runs with output: ${runs.length}`);
  console.log(apply ? "mode: APPLY\n" : "mode: dry run (pass --apply to execute)\n");

  const claimed = new Set(runs.map((r) => r.outputRelPath!));
  let renamed = 0;
  let already = 0;
  const failures: { run: string; error: string }[] = [];

  for (const run of runs) {
    const oldPrefix = run.outputRelPath!;
    const parent = path.posix.dirname(oldPrefix);
    const stampedAt = run.startedAt ?? run.createdAt;

    let newPrefix = `${parent}/${runFolderSlug(run.task.name, stampedAt)}`;
    if (newPrefix === oldPrefix) {
      already++;
      continue;
    }
    // Two runs of one task in the same minute collapse to the same slug.
    let n = 1;
    let candidate = newPrefix;
    while (claimed.has(candidate)) candidate = `${newPrefix}-${++n}`;
    newPrefix = candidate;

    const objects = await storage.list(oldPrefix);
    console.log(`${oldPrefix}\n  -> ${newPrefix}  (${objects.length} objects)`);
    if (!apply) {
      claimed.delete(oldPrefix);
      claimed.add(newPrefix);
      renamed++;
      continue;
    }

    try {
      for (const obj of objects) {
        const rel = obj.key.slice(oldPrefix.length + 1);
        await storage.move(obj.key, `${newPrefix}/${rel}`);
      }
      await db.$transaction([
        db.taskRun.update({
          where: { id: run.id },
          data: { outputRelPath: newPrefix },
        }),
        ...run.artifacts.map((a) =>
          db.runArtifact.update({
            where: { id: a.id },
            data: {
              relPath: a.relPath.startsWith(`${oldPrefix}/`)
                ? `${newPrefix}/${a.relPath.slice(oldPrefix.length + 1)}`
                : a.relPath,
            },
          }),
        ),
      ]);
      claimed.delete(oldPrefix);
      claimed.add(newPrefix);
      renamed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ run: oldPrefix, error: message });
      console.error(`  FAILED — ${message}`);
    }
  }

  console.log(
    `\n${apply ? "renamed" : "would rename"} ${renamed} · already slug-style ${already} · failed ${failures.length}`,
  );
  process.exit(failures.length > 0 ? 1 : 0);
}

main();
