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
  const task = await db.task.delete({ where: { id } });
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
