import { publicUrlFor } from "@/lib/storage/config";

/**
 * Browser URL for a stored file. Points at the public R2 bucket when
 * NEXT_PUBLIC_R2_PUBLIC_BASE is configured, otherwise at the auth-gated local
 * media route. Imported by client components, so it must stay driver-free.
 */
export function mediaUrl(relPath: string): string {
  return publicUrlFor(relPath);
}
