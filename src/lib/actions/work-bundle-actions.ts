"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db-client";
import {
  workBundleAddSchema,
  workBundleCreateSchema,
  workBundleReorderSchema,
  workBundleUpdateSchema,
} from "@/lib/validation";

// Write side of bundles. A bundle owns no files — every item is a pointer at a
// RunArtifact — so these actions only ever move ids and `order` around.

/** Revalidate every project surface a bundle change can show up on. */
function revalidateProject(projectId: string) {
  revalidatePath(`/work/p/${projectId}/gallery`);
  revalidatePath(`/work/p/${projectId}/bundles`);
  revalidatePath("/work");
}

/**
 * Keep only the ids that are PNG renders of this project, in the order they
 * were given. Guards against a stale client posting artifacts from elsewhere.
 */
async function projectArtifactIds(
  projectId: string,
  artifactIds: string[],
): Promise<string[]> {
  const rows = await db.runArtifact.findMany({
    where: {
      id: { in: artifactIds },
      kind: "PNG",
      taskRun: { task: { workSession: { projectId } } },
    },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  return artifactIds.filter((id) => allowed.has(id));
}

export async function createWorkBundle(input: unknown) {
  const data = workBundleCreateSchema.parse(input);
  const artifactIds = await projectArtifactIds(data.projectId, data.artifactIds);
  if (artifactIds.length === 0) {
    throw new Error("None of those renders belong to this project.");
  }

  const bundle = await db.workBundle.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      items: {
        create: artifactIds.map((artifactId, order) => ({ artifactId, order })),
      },
    },
    select: { id: true },
  });

  revalidateProject(data.projectId);
  return { id: bundle.id };
}

export async function updateWorkBundle(input: unknown) {
  const data = workBundleUpdateSchema.parse(input);
  const bundle = await db.workBundle.update({
    where: { id: data.id },
    data: {
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.note === undefined ? {} : { note: data.note }),
    },
    select: { projectId: true },
  });

  revalidateProject(bundle.projectId);
  revalidatePath(`/work/p/${bundle.projectId}/bundles/${data.id}`);
}

export async function deleteWorkBundle(id: string) {
  const bundle = await db.workBundle.delete({
    where: { id },
    select: { projectId: true },
  });
  revalidateProject(bundle.projectId);
}

/** Append renders to the end of a bundle, skipping ones already in it. */
export async function addArtifactsToBundle(input: unknown) {
  const data = workBundleAddSchema.parse(input);
  const bundle = await db.workBundle.findUnique({
    where: { id: data.bundleId },
    select: {
      projectId: true,
      items: { select: { artifactId: true, order: true } },
    },
  });
  if (!bundle) throw new Error("That bundle no longer exists.");

  const present = new Set(bundle.items.map((i) => i.artifactId));
  const incoming = await projectArtifactIds(bundle.projectId, data.artifactIds);
  const fresh = incoming.filter((id) => !present.has(id));
  if (fresh.length === 0) return { added: 0 };

  const next = bundle.items.reduce((max, i) => Math.max(max, i.order + 1), 0);
  await db.workBundleItem.createMany({
    data: fresh.map((artifactId, i) => ({
      bundleId: data.bundleId,
      artifactId,
      order: next + i,
    })),
  });
  // createMany skips the updatedAt touch the bundle needs for its rail label.
  await db.workBundle.update({
    where: { id: data.bundleId },
    data: { updatedAt: new Date() },
  });

  revalidateProject(bundle.projectId);
  revalidatePath(`/work/p/${bundle.projectId}/bundles/${data.bundleId}`);
  return { added: fresh.length };
}

export async function removeBundleItem(itemId: string) {
  const item = await db.workBundleItem.delete({
    where: { id: itemId },
    select: { bundleId: true, bundle: { select: { projectId: true } } },
  });

  // Close the gap so `order` stays contiguous and reorder payloads stay simple.
  const rest = await db.workBundleItem.findMany({
    where: { bundleId: item.bundleId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  await db.$transaction([
    ...rest.map((row, order) =>
      db.workBundleItem.update({ where: { id: row.id }, data: { order } }),
    ),
    db.workBundle.update({
      where: { id: item.bundleId },
      data: { updatedAt: new Date() },
    }),
  ]);

  revalidateProject(item.bundle.projectId);
  revalidatePath(`/work/p/${item.bundle.projectId}/bundles/${item.bundleId}`);
}

/**
 * Rewrite slide order from the incoming array. Ids that no longer belong to the
 * bundle are dropped, and any item the client did not send keeps its place at
 * the end, so a stale drag can never delete a slide.
 */
export async function reorderBundleItems(input: unknown) {
  const data = workBundleReorderSchema.parse(input);
  const bundle = await db.workBundle.findUnique({
    where: { id: data.bundleId },
    select: {
      projectId: true,
      items: { orderBy: { order: "asc" }, select: { id: true } },
    },
  });
  if (!bundle) throw new Error("That bundle no longer exists.");

  const known = new Set(bundle.items.map((i) => i.id));
  const ordered = data.itemIds.filter((id) => known.has(id));
  const seen = new Set(ordered);
  const missing = bundle.items.filter((i) => !seen.has(i.id)).map((i) => i.id);
  const final = [...ordered, ...missing];

  await db.$transaction([
    ...final.map((id, order) =>
      db.workBundleItem.update({ where: { id }, data: { order } }),
    ),
    db.workBundle.update({
      where: { id: data.bundleId },
      data: { updatedAt: new Date() },
    }),
  ]);

  revalidateProject(bundle.projectId);
  revalidatePath(`/work/p/${bundle.projectId}/bundles/${data.bundleId}`);
}
