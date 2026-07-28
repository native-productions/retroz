/**
 * Move the `data/` tree between local disk and the configured object store.
 *
 *   STORAGE_DRIVER=s3 bun run storage:migrate              # disk  -> store
 *   STORAGE_DRIVER=s3 bun run storage:migrate -- --force   # re-upload everything
 *   STORAGE_DRIVER=s3 bun run storage:migrate -- --down    # store -> disk
 *
 * Keys are the file's project-relative path, which is exactly what the database
 * already stores in `relPath` / `outputRelPath` — so nothing in the database has
 * to change. Uploads are idempotent: objects that already exist are skipped
 * unless --force is passed.
 *
 * `--down` is the return path. Once the store is live it is the source of truth,
 * and the on-disk copy goes stale — anything that renamed objects (see
 * migrate-run-folders.ts) will not be reflected there. Run --down before
 * switching STORAGE_DRIVER back to "local".
 */
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_ROOT, toAbsolute, toRelative } from "@/lib/paths";
import { storage } from "@/lib/storage";

const force = process.argv.includes("--force");
const down = process.argv.includes("--down");

async function walk(dirAbs: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const childAbs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(childAbs)));
    else if (entry.isFile()) out.push(childAbs);
  }
  return out;
}

/**
 * Pull every object back onto local disk at its key path. Existing files are
 * overwritten — the store wins, which is the point of running this.
 */
async function download() {
  const objects = await storage.list("data");
  console.log(`driver: ${storage.name}`);
  console.log(`target: ${DATA_ROOT}`);
  console.log(`found:  ${objects.length} objects\n`);

  let written = 0;
  let bytes = 0;
  const failed: { key: string; error: string }[] = [];

  for (const [i, obj] of objects.entries()) {
    const position = `[${i + 1}/${objects.length}]`;
    try {
      const buf = await storage.get(obj.key);
      const dest = toAbsolute(obj.key);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      written++;
      bytes += buf.byteLength;
      console.log(`${position} wrote ${obj.key} (${buf.byteLength} bytes)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ key: obj.key, error: message });
      console.error(`${position} FAILED ${obj.key} — ${message}`);
    }
  }

  const mb = (bytes / 1024 / 1024).toFixed(2);
  console.log(`\nwrote ${written} (${mb} MB) · failed ${failed.length}`);
  console.log(
    "\nStale folders from before a rename are not removed — delete data/ first " +
      "for an exact mirror.",
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

async function main() {
  if (storage.name === "local") {
    console.error(
      'STORAGE_DRIVER is "local" — there is no remote store to move to or from. ' +
        "Set STORAGE_DRIVER=s3.",
    );
    process.exit(1);
  }

  if (down) return download();

  const files = await walk(DATA_ROOT);
  console.log(`driver: ${storage.name}`);
  console.log(`source: ${DATA_ROOT}`);
  console.log(`found:  ${files.length} files${force ? " (forcing re-upload)" : ""}\n`);

  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;
  const failed: { key: string; error: string }[] = [];

  for (const [i, absPath] of files.entries()) {
    const key = toRelative(absPath).split(path.sep).join("/");
    const position = `[${i + 1}/${files.length}]`;
    try {
      if (!force && (await storage.exists(key))) {
        skipped++;
        continue;
      }
      const buf = await fs.readFile(absPath);
      await storage.put(key, buf);
      uploaded++;
      bytes += buf.byteLength;
      console.log(`${position} uploaded ${key} (${buf.byteLength} bytes)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ key, error: message });
      console.error(`${position} FAILED   ${key} — ${message}`);
    }
  }

  const mb = (bytes / 1024 / 1024).toFixed(2);
  console.log(
    `\nuploaded ${uploaded} (${mb} MB) · skipped ${skipped} · failed ${failed.length}`,
  );
  if (failed.length > 0) {
    console.log("\nre-run to retry the failures:");
    for (const f of failed) console.log(`  ${f.key}`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
