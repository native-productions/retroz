"use server";

import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db-client";
import { toAbsolute, slugify } from "@/lib/paths";
import { fetchGoogleFont, resolveFamily } from "@/lib/google-fonts";
import { mapGoogleCategory } from "@/lib/font-category";
import {
  googleFontSchema,
  urlFontSchema,
  fontUpdateSchema,
  pairingSchema,
  workflowFontSchema,
} from "@/lib/validation";

async function uniqueFontSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let n = 1;
  while (await db.font.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${++n}`;
  }
  return slug;
}

export async function addGoogleFont(input: unknown) {
  const data = googleFontSchema.parse(input);
  const family = resolveFamily(data.input);
  const slug = await uniqueFontSlug(family);
  const destRelDir = path.join("data", "fonts", slug);
  const destAbsDir = toAbsolute(destRelDir);

  const result = await fetchGoogleFont(
    data.input,
    slug,
    destAbsDir,
    destRelDir,
  );
  if (result.variants.length === 0) {
    throw new Error(`Could not download "${family}".`);
  }

  await db.font.create({
    data: {
      family: result.family,
      slug,
      source: "GOOGLE",
      category: mapGoogleCategory(result.category),
      moodTags: data.moodTags ?? "",
      variants: {
        create: result.variants.map((v) => ({
          weight: v.weight,
          weightRange: v.weightRange,
          style: v.style,
          format: v.format,
          filename: v.filename,
          relPath: v.relPath,
        })),
      },
    },
  });

  revalidatePath("/fonts");
}

export async function addUrlFont(input: unknown) {
  const data = urlFontSchema.parse(input);
  const slug = await uniqueFontSlug(data.family);
  const ext = (path.extname(new URL(data.url).pathname) || ".woff2").replace(
    ".",
    "",
  );
  const format = ["woff2", "woff", "ttf", "otf"].includes(ext) ? ext : "woff2";
  const destRelDir = path.join("data", "fonts", slug);
  const destAbsDir = toAbsolute(destRelDir);
  await fs.mkdir(destAbsDir, { recursive: true });

  const res = await fetch(data.url);
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  const filename = `${slug}-${data.weight}${data.style === "italic" ? "i" : ""}.${format}`;
  await fs.writeFile(path.join(destAbsDir, filename), buf);

  await db.font.create({
    data: {
      family: data.family,
      slug,
      source: "URL",
      category: data.category,
      moodTags: data.moodTags ?? "",
      variants: {
        create: {
          weight: data.weight,
          style: data.style,
          format,
          filename,
          relPath: path.join(destRelDir, filename),
        },
      },
    },
  });

  revalidatePath("/fonts");
}

export async function updateFont(input: unknown) {
  const data = fontUpdateSchema.parse(input);
  const { id, ...rest } = data;
  await db.font.update({ where: { id }, data: rest });
  revalidatePath("/fonts");
}

export async function deleteFont(id: string) {
  const font = await db.font.delete({ where: { id } });
  await fs.rm(toAbsolute(path.join("data", "fonts", font.slug)), {
    recursive: true,
    force: true,
  });
  revalidatePath("/fonts");
}

export async function createPairing(input: unknown) {
  const data = pairingSchema.parse(input);
  await db.fontPairing.create({
    data: {
      name: data.name,
      headingFontId: data.headingFontId,
      bodyFontId: data.bodyFontId,
      moodTags: data.moodTags ?? "",
    },
  });
  revalidatePath("/fonts");
}

export async function deletePairing(id: string) {
  await db.fontPairing.delete({ where: { id } });
  revalidatePath("/fonts");
}

export async function setWorkflowFont(input: unknown) {
  const data = workflowFontSchema.parse(input);
  if (data.assigned) {
    await db.workflowFont.upsert({
      where: {
        workflowId_fontId: {
          workflowId: data.workflowId,
          fontId: data.fontId,
        },
      },
      update: {},
      create: { workflowId: data.workflowId, fontId: data.fontId },
    });
  } else {
    await db.workflowFont.deleteMany({
      where: { workflowId: data.workflowId, fontId: data.fontId },
    });
  }
  revalidatePath(`/workflows/${data.workflowId}`);
}
