import { publicUrlFor } from "@/lib/storage/config";

/**
 * Browser URL for a stored file. Points at the public R2 bucket when
 * NEXT_PUBLIC_R2_PUBLIC_BASE is configured, otherwise at the auth-gated local
 * media route. Imported by client components, so it must stay driver-free.
 *
 * Pass `version` for anything that can be rewritten under the same path — a
 * render the agent revised, for instance. Without it the browser keeps showing
 * the previous image until a manual reload.
 */
export function mediaUrl(relPath: string, version?: string | null): string {
  return publicUrlFor(relPath, version);
}
