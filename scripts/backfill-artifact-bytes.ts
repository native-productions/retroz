/**
 * Fill RunArtifact.bytes for rows written before the column existed.
 *
 *   bun run artifacts:backfill            # dry run — prints what it would set
 *   bun run artifacts:backfill -- --apply # write the sizes
 *
 * Sizes come from one `storage.list()` per run output prefix rather than a
 * per-file stat, so a bucket with thousands of renders costs a handful of
 * requests. Artifacts whose file is gone are reported and left null.
 */
import { db } from "@/lib/db-client";
import { storage } from "@/lib/storage";

const apply = process.argv.includes("--apply");

/** Everything up to the last slash — the run's output folder. */
function prefixOf(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  return at === -1 ? "" : relPath.slice(0, at);
}

async function main() {
  const rows = await db.runArtifact.findMany({
    where: { bytes: null },
    select: { id: true, relPath: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`driver: ${storage.name}`);
  console.log(`artifacts without a size: ${rows.length}`);
  console.log(apply ? "mode: APPLY\n" : "mode: dry run (pass --apply to execute)\n");

  if (rows.length === 0) return;

  // One listing per folder, shared by every artifact that lives in it.
  const sizes = new Map<string, number>();
  const prefixes = [...new Set(rows.map((r) => prefixOf(r.relPath)))];
  for (const prefix of prefixes) {
    try {
      for (const object of await storage.list(prefix)) {
        sizes.set(object.key, object.size);
      }
    } catch (err) {
      console.warn(`  ! could not list ${prefix}: ${String(err)}`);
    }
  }

  let filled = 0;
  let missing = 0;
  for (const row of rows) {
    const size = sizes.get(row.relPath);
    if (size === undefined) {
      missing += 1;
      console.log(`  missing  ${row.relPath}`);
      continue;
    }
    filled += 1;
    if (apply) {
      await db.runArtifact.update({
        where: { id: row.id },
        data: { bytes: size },
      });
    }
  }

  console.log(`\n${apply ? "filled" : "would fill"}: ${filled}`);
  if (missing > 0) console.log(`missing files: ${missing}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
