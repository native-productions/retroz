import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { create as createFont } from "fontkit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db-client";
import { toAbsolute, slugify } from "@/lib/paths";

export const runtime = "nodejs";

const ALLOWED_EXT = new Set([".woff2", ".woff", ".ttf", ".otf"]);

interface ParsedFile {
  family: string;
  weight: number;
  style: string;
  format: string;
  buf: Buffer;
}

function parseFont(name: string, buf: Buffer): ParsedFile | null {
  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  const format = ext.replace(".", "");
  try {
    // fontkit types are loose across collections; treat as a single face
    const font = createFont(buf) as unknown as {
      familyName?: string;
      subfamilyName?: string;
      italicAngle?: number;
      ["OS/2"]?: { usWeightClass?: number };
    };
    const family = font.familyName ?? path.basename(name, ext);
    const sub = (font.subfamilyName ?? "").toLowerCase();
    const italic = sub.includes("italic") || (font.italicAngle ?? 0) !== 0;
    const weight = font["OS/2"]?.usWeightClass ?? 400;
    return {
      family,
      weight,
      style: italic ? "italic" : "normal",
      format,
      buf,
    };
  } catch {
    return {
      family: path.basename(name, ext),
      weight: 400,
      style: "normal",
      format,
      buf,
    };
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
  }

  // parse + group by family
  const groups = new Map<string, ParsedFile[]>();
  for (const file of files) {
    const parsed = parseFont(file.name, Buffer.from(await file.arrayBuffer()));
    if (!parsed) continue;
    const list = groups.get(parsed.family) ?? [];
    list.push(parsed);
    groups.set(parsed.family, list);
  }

  let createdFonts = 0;
  for (const [family, variants] of groups) {
    let slug = slugify(family);
    let n = 1;
    while (await db.font.findUnique({ where: { slug } })) {
      slug = `${slugify(family)}-${++n}`;
    }
    const destRelDir = path.join("data", "fonts", slug);
    await fs.mkdir(toAbsolute(destRelDir), { recursive: true });

    const variantData = [];
    for (const v of variants) {
      const filename = `${slug}-${v.weight}${v.style === "italic" ? "i" : ""}.${v.format}`;
      await fs.writeFile(toAbsolute(path.join(destRelDir, filename)), v.buf);
      variantData.push({
        weight: v.weight,
        style: v.style,
        format: v.format,
        filename,
        relPath: path.join(destRelDir, filename),
      });
    }

    await db.font.create({
      data: {
        family,
        slug,
        source: "UPLOAD",
        category: "SANS",
        variants: { create: variantData },
      },
    });
    createdFonts++;
  }

  return NextResponse.json({ createdFonts });
}
