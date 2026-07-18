import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db-client";
import { toRelative } from "@/lib/paths";
import { campaignDir } from "@/lib/planner-executor";

export const runtime = "nodejs";

// Attach a brief file to a campaign. Text (.txt/.md) is also merged into the
// inline brief so it goes straight into the planner prompt; a .pdf is stored and
// left for the planner's Read tool to ingest (no PDF parser dependency).
const ALLOWED_EXT = new Set([".txt", ".md", ".markdown", ".pdf"]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const campaignId = String(form.get("campaignId") ?? "");
  const file = form.get("file");
  if (!campaignId || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing campaignId or file" }, { status: 400 });
  }

  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const ext = path.extname(file.name).toLowerCase() || ".txt";
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Only .txt, .md, or .pdf briefs are supported" },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const destDir = campaignDir(campaignId);
  await fs.mkdir(destDir, { recursive: true });
  const filename = `brief${ext}`;
  const absPath = path.join(destDir, filename);
  await fs.writeFile(absPath, buf);

  const isText = ext === ".txt" || ext === ".md" || ext === ".markdown";
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      briefRelPath: toRelative(absPath),
      ...(isText ? { brief: buf.toString("utf8").slice(0, 20000) } : {}),
    },
  });

  return NextResponse.json({ ok: true, briefRelPath: toRelative(absPath) });
}
