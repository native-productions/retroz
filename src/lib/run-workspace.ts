import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { storage } from "@/lib/storage";

/**
 * A local working directory for one agent run.
 *
 * The agent and Playwright both need real files: the agent reads source photos
 * off disk and writes HTML there, and the renderer loads its page over `file://`
 * so local photos and fonts resolve. Object storage has no such paths, so every
 * run gets a scratch directory that inputs are hydrated into and outputs are
 * uploaded from.
 *
 * On the local driver this costs nothing — `storage.hydrate*` returns the real
 * `data/` path instead of copying, and `close()` uploads to the directory the
 * files are already in. Both drivers therefore run the exact same code path.
 */
export interface RunWorkspace {
  /** Directory the agent writes final output into. */
  readonly outDirAbs: string;
  /** Storage key prefix those outputs belong under. */
  readonly outPrefix: string;

  /** Materialize a stored folder and return the local directory holding it. */
  dir(prefix: string, name: string): Promise<string>;
  /** Materialize stored files, returning a key → absolute path lookup. */
  files(keys: string[], name: string): Promise<Map<string, string>>;
  /**
   * An empty local directory for files the run needs on disk but must NOT
   * publish — only `outDirAbs` is uploaded on close.
   */
  scratch(name: string): Promise<string>;
  /** Upload anything the agent left in the output directory, then clean up. */
  close(): Promise<void>;
}

export async function openRunWorkspace(
  id: string,
  outPrefix: string,
): Promise<RunWorkspace> {
  const rootAbs = path.join(os.tmpdir(), `retroz-run-${id}`);
  await fs.mkdir(rootAbs, { recursive: true });

  const outDirAbs = await storage.hydratePrefix(
    outPrefix,
    path.join(rootAbs, "out"),
  );

  return {
    outDirAbs,
    outPrefix,

    async dir(prefix, name) {
      return storage.hydratePrefix(prefix, path.join(rootAbs, name));
    },

    async files(keys, name) {
      const resolved = new Map<string, string>();
      for (const key of keys) {
        // Mirror the key path under the subdirectory so distinct keys with the
        // same basename cannot collide.
        const dest = path.join(rootAbs, name, ...key.split("/"));
        resolved.set(key, await storage.hydrate(key, dest));
      }
      return resolved;
    },

    async scratch(name) {
      const dirAbs = path.join(rootAbs, name);
      await fs.mkdir(dirAbs, { recursive: true });
      return dirAbs;
    },

    async close() {
      try {
        await storage.putDir(outDirAbs, outPrefix);
      } finally {
        await fs.rm(rootAbs, { recursive: true, force: true });
      }
    },
  };
}
