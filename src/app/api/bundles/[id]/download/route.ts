import { zipSync } from "fflate";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db-client";
import { slugify } from "@/lib/paths";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Download a bundle as a zip of its slides in carousel order, named
 * `01-hook.png`, `02-…` and so on. Instagram's picker sorts by filename, so the
 * numeric prefix is what makes the upload land in the right order without any
 * dragging on the phone.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const bundle = await db.workBundle.findUnique({
    where: { id },
    select: {
      name: true,
      items: {
        orderBy: { order: "asc" },
        select: { artifact: { select: { filename: true, relPath: true } } },
      },
    },
  });
  if (!bundle) return new Response("Not found", { status: 404 });
  if (bundle.items.length === 0) {
    return new Response("This bundle has no slides yet", { status: 409 });
  }

  const pad = String(bundle.items.length).length;
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];

  for (const [i, item] of bundle.items.entries()) {
    const prefix = String(i + 1).padStart(Math.max(2, pad), "0");
    try {
      const buffer = await storage.get(item.artifact.relPath);
      files[`${prefix}-${item.artifact.filename}`] = new Uint8Array(buffer);
    } catch {
      missing.push(item.artifact.filename);
    }
  }

  if (Object.keys(files).length === 0) {
    return new Response("None of this bundle's files could be read", {
      status: 404,
    });
  }
  // A slide whose file vanished should not fail the whole download — say so in
  // a header the client surfaces instead.
  const zip = zipSync(files, { level: 0 });
  const name = `${slugify(bundle.name) || "bundle"}.zip`;

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      ...(missing.length > 0
        ? { "X-Retroz-Missing": String(missing.length) }
        : {}),
    },
  });
}
