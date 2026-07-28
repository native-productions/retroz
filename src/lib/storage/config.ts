/**
 * Client-safe storage config. Imported by `lib/media.ts`, which client
 * components use to build image URLs — so this module must never pull in a
 * driver, the AWS SDK, or anything from `node:`.
 *
 * `NEXT_PUBLIC_S3_PUBLIC_BASE` is the single switch the browser sees: when it
 * is set, files are served straight from the public bucket; otherwise they go
 * through the auth-gated `/api/media` route backed by the local disk.
 */
export const S3_PUBLIC_BASE = (
  process.env.NEXT_PUBLIC_S3_PUBLIC_BASE ?? ""
).replace(/\/+$/, "");

/** Browser-reachable URL for a storage key. */
export function publicUrlFor(key: string): string {
  const clean = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!S3_PUBLIC_BASE) return `/api/media?path=${encodeURIComponent(clean)}`;
  return `${S3_PUBLIC_BASE}/${clean.split("/").map(encodeURIComponent).join("/")}`;
}
