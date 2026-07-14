import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db-client";
import { toAbsolute, slugify } from "@/lib/paths";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

async function writeFile(destDir: string, file: File): Promise<{
  filename: string;
  relPath: string;
  buf: Buffer;
  width: number | null;
  height: number | null;
} | null> {
  if (!ALLOWED.has(file.type)) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || `.${file.type.split("/")[1]}`;
  const base = slugify(path.basename(file.name, path.extname(file.name)));
  let filename = `${base}${ext}`;
  let i = 1;
  while (
    await fs
      .access(path.join(destDir, filename))
      .then(() => true)
      .catch(() => false)
  ) {
    filename = `${base}-${i++}${ext}`;
  }
  await fs.writeFile(path.join(destDir, filename), buf);

  let width: number | null = null;
  let height: number | null = null;
  try {
    const meta = await sharp(buf).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    // non-fatal (e.g. some SVGs)
  }
  return { filename, relPath: "", buf, width, height };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const folderId = String(form.get("folderId") ?? "");
  const workflowId = String(form.get("workflowId") ?? "");
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
    const destDir = toAbsolute(relDir);
    await fs.mkdir(destDir, { recursive: true });

    let count = 0;
    for (const file of files) {
      const w = await writeFile(destDir, file);
      if (!w) continue;
      await db.workflowAsset.create({
        data: {
          workflowId,
          filename: w.filename,
          relPath: path.join(relDir, w.filename),
          mimeType: file.type,
          size: w.buf.byteLength,
          width: w.width,
          height: w.height,
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
  const destDir = toAbsolute(folder.relPath);
  await fs.mkdir(destDir, { recursive: true });

  let count = 0;
  for (const file of files) {
    const w = await writeFile(destDir, file);
    if (!w) continue;
    await db.asset.create({
      data: {
        folderId,
        filename: w.filename,
        relPath: path.join(folder.relPath, w.filename),
        mimeType: file.type,
        size: w.buf.byteLength,
        width: w.width,
        height: w.height,
      },
    });
    count++;
  }
  return NextResponse.json({ created: count });
}
