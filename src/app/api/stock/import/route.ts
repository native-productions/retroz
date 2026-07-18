import { NextResponse } from "next/server";
import path from "node:path";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db-client";
import { storeImage, ALLOWED_IMAGE_MIME } from "@/lib/asset-store";
import { deriveKeywords } from "@/lib/asset-ranker";
import { getPexelsKey } from "@/lib/pexels";
import { ALLOWED_STOCK_HOSTS, isStockSource, type StockSource } from "@/lib/stock";

export const runtime = "nodejs";

const USER_AGENT = "Retroz/1.0 (local content assistant)";

interface ImportPhoto {
  id: string;
  url: string;
  alt?: string;
  mime?: string;
  attribution?: string;
}

/** Merge an optional seed (campaign label) with alt + attribution into the
 *  stored description. Seed stays the prefix so campaign matching still works. */
function buildDescription(
  seed: string,
  alt: string,
  attribution: string,
): string {
  const base = seed || alt;
  if (attribution && base) return `${base} — ${attribution}`;
  return base || attribution;
}

/**
 * Download chosen stock photos (Pexels or Wikimedia Commons) into an asset
 * scope and record them like an upload. Pexels requires a configured key; both
 * sources are SSRF-guarded to their own image CDNs. Description + tags are
 * auto-filled from the provider's caption; attribution is retained for
 * licensing.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    source?: string;
    folderId?: string;
    workflowId?: string;
    description?: string;
    photos?: ImportPhoto[];
  } | null;

  const source = body?.source;
  if (!isStockSource(source)) {
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }
  // Pexels needs a key; Wikimedia is keyless.
  if (source === "pexels" && !(await getPexelsKey())) {
    return NextResponse.json({ error: "Pexels is not configured." }, { status: 400 });
  }

  const photos = body?.photos ?? [];
  if (photos.length === 0) {
    return NextResponse.json({ error: "No photos" }, { status: 400 });
  }

  // SSRF guard: only fetch from this source's allowed image hosts.
  const allowedHosts = ALLOWED_STOCK_HOSTS[source as StockSource];
  for (const p of photos) {
    let host = "";
    try {
      host = new URL(p.url).hostname;
    } catch {
      return NextResponse.json({ error: "Bad photo URL" }, { status: 400 });
    }
    if (!allowedHosts.includes(host)) {
      return NextResponse.json(
        { error: `Only ${source} images allowed` },
        { status: 400 },
      );
    }
  }

  const seed = body?.description?.trim() ?? "";

  type Stored = {
    filename: string;
    relPath: string;
    size: number;
    width: number | null;
    height: number | null;
  };

  let relDir: string;
  let record: (stored: Stored, photo: ImportPhoto, mime: string) => Promise<void>;

  if (body?.workflowId && !body.folderId) {
    const workflow = await db.workflow.findUnique({ where: { id: body.workflowId } });
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }
    relDir = path.join("data", "assets", workflow.slug, "_global");
    record = async (s, photo, mime) => {
      await db.workflowAsset.create({
        data: {
          workflowId: workflow.id,
          filename: s.filename,
          relPath: s.relPath,
          mimeType: mime,
          size: s.size,
          width: s.width,
          height: s.height,
          description: buildDescription("", (photo.alt ?? "").trim(), (photo.attribution ?? "").trim()),
        },
      });
    };
  } else if (body?.folderId) {
    const folder = await db.assetFolder.findUnique({ where: { id: body.folderId } });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    relDir = folder.relPath;
    record = async (s, photo, mime) => {
      const alt = (photo.alt ?? "").trim();
      await db.asset.create({
        data: {
          folderId: folder.id,
          filename: s.filename,
          relPath: s.relPath,
          mimeType: mime,
          size: s.size,
          width: s.width,
          height: s.height,
          description: buildDescription(seed, alt, (photo.attribution ?? "").trim()),
          // Tags come from the caption only — not the author/license string.
          tags: deriveKeywords(alt),
          autoDescribed: true,
        },
      });
    };
  } else {
    return NextResponse.json(
      { error: "Missing folderId or workflowId" },
      { status: 400 },
    );
  }

  let count = 0;
  for (const p of photos) {
    const mime = p.mime && ALLOWED_IMAGE_MIME.has(p.mime) ? p.mime : "image/jpeg";
    // Skip anything that is not a supported bitmap (e.g. Wikimedia TIFF/SVG).
    if (!ALLOWED_IMAGE_MIME.has(mime)) continue;

    const res = await fetch(p.url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const name = `${source}-${p.id}.${ext}`;

    const stored = await storeImage(relDir, { buf, mimeType: mime, name });
    await record(stored, p, mime);
    count++;
  }

  return NextResponse.json({ created: count });
}
