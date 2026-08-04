import path from "node:path";
import { sharedSlidePath } from "@/lib/bundle-share";
import { DATA_ROOT } from "@/lib/paths";
import { contentTypeFor } from "@/lib/mime";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * One slide of a shared bundle, for the phone that scanned the QR code.
 *
 * Unauthenticated by design — the token in the path is the credential, and it
 * only reaches artifacts that belong to the bundle it opens. Same traversal
 * guard as `/api/media`: a stored path that escapes DATA_ROOT is refused.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; artifactId: string }> },
) {
  const { token, artifactId } = await params;

  const slide = await sharedSlidePath(token, artifactId);
  if (!slide) return new Response("Not found", { status: 404 });

  const abs = path.resolve(process.cwd(), slide.relPath);
  if (abs !== DATA_ROOT && !abs.startsWith(DATA_ROOT + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  let data: Buffer;
  try {
    data = await storage.get(slide.relPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentTypeFor(abs),
      // Named so a long-press "Save to Files" on iOS keeps the slide's name.
      "Content-Disposition": `inline; filename="${slide.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
