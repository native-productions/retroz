import fs from "node:fs/promises";
import path from "node:path";
import { toAbsolute } from "@/lib/paths";
import { publicUrlFor } from "./config";
import { normalizeKey, type PutOptions, type Storage, type StorageObject } from "./types";

/**
 * Filesystem driver: keys are project-relative paths, so a key maps directly to
 * a file under the project root. This is the behavior Retroz had before the
 * storage layer existed, and the `hydrate*` methods are deliberately free here
 * — the bytes are already local, so callers that support R2 pay nothing.
 */
export class LocalStorage implements Storage {
  readonly name = "local" as const;

  private abs(key: string): string {
    return toAbsolute(normalizeKey(key));
  }

  async put(key: string, body: Buffer, _opts?: PutOptions): Promise<void> {
    const dest = this.abs(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, body);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.abs(key));
  }

  async exists(key: string): Promise<boolean> {
    return fs
      .access(this.abs(key))
      .then(() => true)
      .catch(() => false);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.abs(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await fs.rm(this.abs(prefix), { recursive: true, force: true });
  }

  async list(prefix: string): Promise<StorageObject[]> {
    const root = normalizeKey(prefix);
    const out: StorageObject[] = [];
    await walk(this.abs(root), root, out);
    return out;
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const dest = this.abs(toKey);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(this.abs(fromKey), dest);
  }

  async ensurePrefix(prefix: string): Promise<void> {
    await fs.mkdir(this.abs(prefix), { recursive: true });
  }

  publicUrl(key: string): string {
    return publicUrlFor(normalizeKey(key));
  }

  async hydrate(key: string, _destAbs: string): Promise<string> {
    return this.abs(key);
  }

  async hydratePrefix(prefix: string, _destDirAbs: string): Promise<string> {
    const dir = this.abs(prefix);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async putDir(srcDirAbs: string, prefix: string): Promise<void> {
    const dest = this.abs(prefix);
    if (path.resolve(srcDirAbs) === dest) return;
    await fs.mkdir(dest, { recursive: true });
    await fs.cp(srcDirAbs, dest, { recursive: true });
  }
}

/** Depth-first walk collecting files as prefix-relative keys. */
async function walk(
  dirAbs: string,
  keyPrefix: string,
  out: StorageObject[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return; // missing directory lists as empty, matching object-store semantics
  }
  for (const entry of entries) {
    const childAbs = path.join(dirAbs, entry.name);
    const childKey = keyPrefix ? `${keyPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walk(childAbs, childKey, out);
    } else if (entry.isFile()) {
      const stat = await fs.stat(childAbs);
      out.push({ key: childKey, size: stat.size });
    }
  }
}
