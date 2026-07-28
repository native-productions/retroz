"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db-client";
import { storage } from "@/lib/storage";
import { globalAssetUpdateSchema } from "@/lib/validation";

export async function updateGlobalAsset(input: unknown) {
  const data = globalAssetUpdateSchema.parse(input);
  const { id, ...rest } = data;
  const asset = await db.workflowAsset.update({ where: { id }, data: rest });
  revalidatePath(`/workflows/${asset.workflowId}`);
}

export async function deleteGlobalAsset(id: string) {
  const asset = await db.workflowAsset.delete({ where: { id } });
  await storage.delete(asset.relPath);
  revalidatePath(`/workflows/${asset.workflowId}`);
}
