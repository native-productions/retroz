"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db-client";
import { toAbsolute, slugify } from "@/lib/paths";
import {
  folderCreateSchema,
  folderRenameSchema,
  assetDescriptionSchema,
  assetTagsSchema,
  assetCaptionSaveSchema,
  assetCaptionGenerateSchema,
  assetRenameSchema,
} from "@/lib/validation";
import {
  generateCaptionSuggestions,
  type CaptionSuggestion,
} from "@/lib/asset-caption";

async function uniqueFolderSlug(
  workflowId: string,
  base: string,
): Promise<string> {
  let slug = slugify(base);
  let n = 1;
  while (
    await db.assetFolder.findUnique({
      where: { workflowId_slug: { workflowId, slug } },
    })
  ) {
    slug = `${slugify(base)}-${++n}`;
  }
  return slug;
}

export async function createFolder(input: unknown) {
  const data = folderCreateSchema.parse(input);
  const workflow = await db.workflow.findUniqueOrThrow({
    where: { id: data.workflowId },
  });
  const slug = await uniqueFolderSlug(data.workflowId, data.name);
  const relPath = path.join("data", "assets", workflow.slug, slug);

  await fs.mkdir(toAbsolute(relPath), { recursive: true });

  await db.assetFolder.create({
    data: {
      workflowId: data.workflowId,
      name: data.name,
      slug,
      relPath,
      notes: data.notes ?? null,
    },
  });

  revalidatePath(`/workflows/${data.workflowId}`);
}

export async function renameFolder(input: unknown) {
  const data = folderRenameSchema.parse(input);
  // Rename the display name/notes only. The slug and relPath stay stable so the
  // files on disk and each asset's stored relPath keep resolving.
  const folder = await db.assetFolder.update({
    where: { id: data.id },
    data: { name: data.name, notes: data.notes ?? null },
  });
  revalidatePath(`/assets/${folder.id}`);
  revalidatePath(`/workflows/${folder.workflowId}`);
}

export async function deleteFolder(id: string, options?: { redirectTo?: string }) {
  const folder = await db.assetFolder.findUniqueOrThrow({ where: { id } });
  await db.assetFolder.delete({ where: { id } });
  // best-effort remove files
  await fs.rm(toAbsolute(folder.relPath), { recursive: true, force: true });
  revalidatePath(`/workflows/${folder.workflowId}`);
  if (options?.redirectTo) redirect(options.redirectTo);
}

export async function updateAssetDescription(input: unknown) {
  const data = assetDescriptionSchema.parse(input);
  const asset = await db.asset.update({
    where: { id: data.id },
    data: { description: data.description },
  });
  revalidatePath(`/assets/${asset.folderId}`);
}

export async function updateAssetTags(input: unknown) {
  const data = assetTagsSchema.parse(input);
  const normalized = [
    ...new Set(
      data.tags.map((t) => t.toLowerCase().trim()).filter(Boolean),
    ),
  ];
  const asset = await db.asset.update({
    where: { id: data.id },
    data: { tags: normalized },
  });
  revalidatePath(`/assets/${asset.folderId}`);
}

/**
 * Generate caption suggestions for one or more assets. Returns previews — nothing
 * is persisted until the user confirms via saveAssetCaption.
 */
export async function generateAssetCaptions(
  input: unknown,
): Promise<CaptionSuggestion[]> {
  const data = assetCaptionGenerateSchema.parse(input);
  return generateCaptionSuggestions(data.ids);
}

/** Persist a caption the user confirmed from a suggestion. */
export async function saveAssetCaption(input: unknown) {
  const data = assetCaptionSaveSchema.parse(input);
  const normalized = [
    ...new Set(
      data.tags.map((t) => t.toLowerCase().trim()).filter(Boolean),
    ),
  ];
  const asset = await db.asset.update({
    where: { id: data.id },
    data: {
      description: data.description,
      tags: normalized,
      autoDescribed: true,
    },
  });
  revalidatePath(`/assets/${asset.folderId}`);
}

export async function renameAsset(input: unknown) {
  const data = assetRenameSchema.parse(input);
  const asset = await db.asset.findUniqueOrThrow({ where: { id: data.id } });

  const ext = path.extname(asset.filename);
  const base = slugify(path.basename(data.name, path.extname(data.name)));
  const dir = path.dirname(asset.relPath);

  // Ensure the new filename is unique within the folder.
  let filename = `${base}${ext}`;
  let n = 1;
  while (
    filename !== asset.filename &&
    (await db.asset.findFirst({
      where: {
        folderId: asset.folderId,
        filename,
        id: { not: asset.id },
      },
    }))
  ) {
    filename = `${base}-${++n}${ext}`;
  }

  if (filename !== asset.filename) {
    const relPath = path.join(dir, filename);
    await fs.rename(toAbsolute(asset.relPath), toAbsolute(relPath));
    await db.asset.update({
      where: { id: asset.id },
      data: { filename, relPath },
    });
  }

  revalidatePath(`/assets/${asset.folderId}`);
}

export async function deleteAsset(id: string) {
  const asset = await db.asset.findUniqueOrThrow({ where: { id } });
  await db.asset.delete({ where: { id } });
  await fs.rm(toAbsolute(asset.relPath), { force: true });
  revalidatePath(`/assets/${asset.folderId}`);
}
