"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db-client";
import { DATA_ROOT, slugify } from "@/lib/paths";
import {
  workflowCreateSchema,
  workflowUpdateSchema,
} from "@/lib/validation";

async function uniqueWorkflowSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let n = 1;
  while (await db.workflow.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${++n}`;
  }
  return slug;
}

export async function createWorkflow(input: unknown) {
  const data = workflowCreateSchema.parse(input);
  const slug = await uniqueWorkflowSlug(data.name);

  const workflow = await db.workflow.create({
    data: {
      name: data.name,
      slug,
      platform: data.platform,
      description: data.description ?? null,
    },
  });

  // pre-create the asset root for this workflow
  await fs.mkdir(path.join(DATA_ROOT, "assets", slug), { recursive: true });
  await fs.mkdir(path.join(DATA_ROOT, "tasks", slug), { recursive: true });

  revalidatePath("/workflows");
  redirect(`/workflows/${workflow.id}`);
}

export async function updateWorkflow(input: unknown) {
  const data = workflowUpdateSchema.parse(input);
  const { id, ...rest } = data;
  await db.workflow.update({ where: { id }, data: rest });
  revalidatePath(`/workflows/${id}`);
  revalidatePath("/workflows");
}

export async function deleteWorkflow(id: string) {
  await db.workflow.delete({ where: { id } });
  revalidatePath("/workflows");
  redirect("/workflows");
}
