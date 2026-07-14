import fs from "node:fs";
import path from "node:path";
import { auth } from "@/lib/auth";
import { DATA_ROOT } from "@/lib/paths";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
};

// Serves files from the local data/ store. Auth-gated + path-traversal-guarded:
// only paths that resolve inside DATA_ROOT are allowed.
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
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(abs).toLowerCase();
  const data = fs.readFileSync(abs);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}
