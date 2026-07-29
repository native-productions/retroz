import { NextResponse } from "next/server";
import path from "node:path";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db-client";
import { ALLOWED_IMAGE_MIME, storeImage } from "@/lib/asset-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const folderId = String(form.get("folderId") ?? "");
  const workflowId = String(form.get("workflowId") ?? "");
  // Optional: seed every created asset's description (used by campaign uploads
  // to carry the planner's requested-photo label + description).
  const description = String(form.get("description") ?? "");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
  }

  // --- global workflow asset scope ---
  if (workflowId && !folderId) {
    const workflow = await db.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }
    const relDir = path.join("data", "assets", workflow.slug, "_global");

    let count = 0;
    for (const file of files) {
      const stored = await store(relDir, file);
      if (!stored) continue;
      await db.workflowAsset.create({
        data: {
          workflowId,
          filename: stored.filename,
          relPath: stored.relPath,
          mimeType: file.type,
          size: stored.size,
          width: stored.width,
          height: stored.height,
        },
      });
      count++;
    }
    return NextResponse.json({ created: count });
  }

  // --- folder asset scope ---
  if (!folderId) {
    return NextResponse.json(
      { error: "Missing folderId or workflowId" },
      { status: 400 },
    );
  }
  const folder = await db.assetFolder.findUnique({ where: { id: folderId } });
  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  // The created rows come back so callers that need to reference an upload
  // immediately (the Work composer builds an @mention out of it) don't have to
  // re-query the folder.
  const created: { id: string; filename: string; relPath: string }[] = [];
  for (const file of files) {
    const stored = await store(folder.relPath, file);
    if (!stored) continue;
    const asset = await db.asset.create({
      data: {
        folderId,
        filename: stored.filename,
        relPath: stored.relPath,
        mimeType: file.type,
        size: stored.size,
        width: stored.width,
        height: stored.height,
        description,
      },
      select: { id: true, filename: true, relPath: true },
    });
    created.push(asset);
  }
  return NextResponse.json({ created: created.length, assets: created });
}

/** Store one upload, skipping anything that is not an accepted image type. */
async function store(relDir: string, file: File) {
  if (!ALLOWED_IMAGE_MIME.has(file.type)) return null;
  return storeImage(relDir, {
    buf: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
    name: file.name,
  });
}
