/** Build a URL to the auth-gated local media server for a stored relPath. */
export function mediaUrl(relPath: string): string {
  return `/api/media?path=${encodeURIComponent(relPath)}`;
}
