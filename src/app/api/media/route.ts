import path from "node:path";
import { auth } from "@/lib/auth";
import { DATA_ROOT } from "@/lib/paths";
import { contentTypeFor } from "@/lib/mime";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

// Serves files from the blob store. Auth-gated + traversal-guarded: only keys
// that resolve inside DATA_ROOT are allowed. Used by the local driver; with a
// public R2 bucket the UI links to object URLs directly and skips this route.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const rel = url.searchParams.get("path");
  if (!rel) return new Response("Missing path", { status: 400 });

  const abs = path.resolve(process.cwd(), rel);
  if (abs !== DATA_ROOT && !abs.startsWith(DATA_ROOT + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  let data: Buffer;
  try {
    data = await storage.get(rel);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentTypeFor(abs),
      "Cache-Control": "no-store",
    },
  });
}
