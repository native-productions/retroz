"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db-client";
import { enqueueRun } from "@/lib/run-queue";
import { getRunController } from "@/lib/run-control";
import { emitRunEvent } from "@/lib/run-bus";
import { removeTaskOutputs } from "@/lib/task-outputs";
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
  await removeTaskOutputs([id]);
  const task = await db.task.delete({ where: { id } });
  if (item) revalidatePath(`/campaigns/${item.campaignId}`);
  revalidatePath(`/workflows/${task.workflowId}`);
  redirect(`/workflows/${task.workflowId}`);
}

/** Stop an in-flight (or still-queued) run. */
export async function stopRun(taskRunId: string) {
  const controller = getRunController(taskRunId);
  if (controller) {
    // Running — abort the agent; executeRun finalizes it as CANCELLED + emits STATUS.
    controller.abort();
  } else {
    // Queued (not started yet) — cancel directly and notify any live viewer.
    const run = await db.taskRun.findUnique({
      where: { id: taskRunId },
      select: { status: true },
    });
    if (run && (run.status === "QUEUED" || run.status === "RUNNING")) {
      await db.taskRun.update({
        where: { id: taskRunId },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });
      const last = await db.runEvent.findFirst({
        where: { taskRunId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const seq = (last?.seq ?? -1) + 1;
      await db.runEvent.create({
        data: { taskRunId, seq, type: "STATUS", payload: { status: "CANCELLED" } },
      });
      emitRunEvent(taskRunId, {
        seq,
        type: "STATUS",
        payload: { status: "CANCELLED" },
        ts: new Date().toISOString(),
      });
    }
  }
  revalidatePath(`/runs/${taskRunId}`);
}

/** Queue a manual run and jump to the live viewer. */
export async function triggerRun(taskId: string) {
  const run = await db.taskRun.create({
    data: { taskId, status: "QUEUED", trigger: "manual" },
  });
  enqueueRun(run.id);
  redirect(`/runs/${run.id}`);
}
