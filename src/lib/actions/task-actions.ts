"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db-client";
import { enqueueRun } from "@/lib/run-queue";
import { taskCreateSchema, taskUpdateSchema } from "@/lib/validation";

export async function createTask(input: unknown) {
  const data = taskCreateSchema.parse(input);
  const task = await db.task.create({
    data: {
      workflowId: data.workflowId,
      name: data.name,
      instruction: data.instruction ?? "",
      assetFolderId: data.assetFolderId ?? null,
      model: data.model ?? null,
    },
  });
  revalidatePath(`/workflows/${data.workflowId}`);
  return { id: task.id };
}

export async function updateTask(input: unknown) {
  const data = taskUpdateSchema.parse(input);
  const { id, ...rest } = data;
  const task = await db.task.update({ where: { id }, data: rest });
  revalidatePath(`/tasks/${id}`);
  revalidatePath(`/workflows/${task.workflowId}`);
}

export async function deleteTask(id: string) {
  // Keep campaigns in sync: if this task backs a campaign item, remove that item
  // too (otherwise it lingers on the campaign page with no task to run).
  const item = await db.campaignItem.findUnique({
    where: { taskId: id },
    select: { id: true, campaignId: true },
  });
  if (item) await db.campaignItem.delete({ where: { id: item.id } });
  const task = await db.task.delete({ where: { id } });
  if (item) revalidatePath(`/campaigns/${item.campaignId}`);
  revalidatePath(`/workflows/${task.workflowId}`);
  redirect(`/workflows/${task.workflowId}`);
}

/** Queue a manual run and jump to the live viewer. */
export async function triggerRun(taskId: string) {
  const run = await db.taskRun.create({
    data: { taskId, status: "QUEUED", trigger: "manual" },
  });
  enqueueRun(run.id);
  redirect(`/runs/${run.id}`);
}
