/**
 * Blob storage contract. Keys are the project-relative paths already stored in
 * the database (`data/assets/<workflow>/<folder>/photo.png`) — the same string
 * is a path on disk for the local driver and an object key for R2, so no
 * migration is needed to move between them.
 *
 * Keys always use forward slashes and never start with "/".
 */
export interface StorageObject {
  key: string;
  size: number;
}

export interface PutOptions {
  /** Defaults to `contentTypeFor(key)`. */
  contentType?: string;
}

export interface Storage {
  /** Driver identity, for logging and driver-specific branches in scripts. */
  readonly name: "local" | "s3";

  put(key: string, body: Buffer, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Remove every object under a key prefix. Missing prefixes are not an error. */
  deletePrefix(prefix: string): Promise<void>;
  /** Every object under a prefix, recursively, keyed by its full key. */
  list(prefix: string): Promise<StorageObject[]>;
  move(fromKey: string, toKey: string): Promise<void>;
  /**
   * Ensure a prefix is usable for writes. The local driver creates the
   * directory; object stores have no directories, so this is a no-op there
   * (folder existence is tracked by database rows, never by the store).
   */
  ensurePrefix(prefix: string): Promise<void>;

  /** Browser-reachable URL for a key. */
  publicUrl(key: string): string;

  /**
   * Materialize a single object at `destAbs` and return the absolute path.
   * The local driver ignores `destAbs` and returns the file's real path — the
   * bytes are already on disk.
   */
  hydrate(key: string, destAbs: string): Promise<string>;

  /**
   * Materialize every object under `prefix` into `destDirAbs`, stripping the
   * prefix so the directory mirrors the folder, and return the directory that
   * now holds them. The local driver ignores `destDirAbs`, creates the real
   * directory, and returns it. Also used to obtain a writable directory for a
   * prefix that has no objects yet (an agent's output folder).
   */
  hydratePrefix(prefix: string, destDirAbs: string): Promise<string>;

  /**
   * Upload a local directory tree under `prefix`. A no-op on the local driver
   * when the source already is that prefix's directory.
   */
  putDir(srcDirAbs: string, prefix: string): Promise<void>;
}

/** Normalize a key: forward slashes, no leading or trailing separator. */
export function normalizeKey(key: string): string {
  return key.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
