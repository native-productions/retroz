import { LocalStorage } from "./local-driver";
import { S3Storage } from "./s3-driver";
import { S3_PUBLIC_BASE } from "./config";
import type { Storage } from "./types";

export type { Storage, StorageObject, PutOptions } from "./types";
export { normalizeKey } from "./types";
export { publicUrlFor, S3_PUBLIC_BASE } from "./config";

// Single driver instance, cached across HMR reloads in dev (same pattern as
// db-client.ts) so an S3 client is not rebuilt on every server module reload.
const globalForStorage = globalThis as unknown as {
  storage?: Storage;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when STORAGE_DRIVER="s3".`);
  }
  return value;
}

function createStorage(): Storage {
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  switch (driver) {
    case "local":
      // The public base tells the browser to read straight from the bucket, but
      // the local driver writes to disk — new uploads would never appear at
      // those URLs. Fail now rather than serve silently stale images.
      if (S3_PUBLIC_BASE) {
        throw new Error(
          'NEXT_PUBLIC_S3_PUBLIC_BASE is set while STORAGE_DRIVER="local". ' +
            'Clear it, or set STORAGE_DRIVER="s3".',
        );
      }
      return new LocalStorage();
    case "s3":
      return new S3Storage({
        endpoint: required("S3_ENDPOINT"),
        region: process.env.S3_REGION ?? "auto",
        bucket: required("S3_BUCKET"),
        accessKeyId: required("S3_ACCESS_KEY_ID"),
        secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      });
    default:
      throw new Error(
        `Unknown STORAGE_DRIVER "${driver}". Expected "local" or "s3".`,
      );
  }
}

export const storage: Storage = globalForStorage.storage ?? createStorage();

if (process.env.NODE_ENV !== "production") {
  globalForStorage.storage = storage;
}
