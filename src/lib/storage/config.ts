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

/**
 * Browser-reachable URL for a storage key.
 *
 * `version` is a cache-buster for keys that get rewritten in place. Re-rendering
 * a slide overwrites its object, so the URL alone is not enough: the browser
 * (and, on a public bucket, the CDN) would keep serving the image the user asked
 * to change until a reload. Pass something that changes with the bytes — the
 * RunArtifact row id is new on every render.
 */
export function publicUrlFor(key: string, version?: string | null): string {
  const clean = key.replace(/\\/g, "/").replace(/^\/+/, "");
  const url = S3_PUBLIC_BASE
    ? `${S3_PUBLIC_BASE}/${clean.split("/").map(encodeURIComponent).join("/")}`
    : `/api/media?path=${encodeURIComponent(clean)}`;
  if (!version) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}
