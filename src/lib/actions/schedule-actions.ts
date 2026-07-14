"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db-client";
import { scheduleCreateSchema } from "@/lib/validation";
import { buildCronExpr, computeNextRun, type Cadence } from "@/lib/cron-expr";
import { refreshSchedule, unregisterSchedule } from "@/lib/cron-scheduler";

export async function createSchedule(input: unknown) {
  const data = scheduleCreateSchema.parse(input);
  const cronExpr = buildCronExpr(data.cadence, data.timeOfDay);
  const nextRunAt = computeNextRun(
    data.cadence as Cadence,
    data.timeOfDay,
    new Date(),
  );

  const schedule = await db.schedule.create({
    data: {
      workflowId: data.workflowId,
      cadence: data.cadence,
      cronExpr,
      timeOfDay: data.timeOfDay,
      timezone: data.timezone,
      nextRunAt,
    },
  });

  // bind chosen task to this schedule
  if (data.taskId) {
    await db.task.update({
      where: { id: data.taskId },
      data: { scheduleId: schedule.id },
    });
  }

  await refreshSchedule(schedule.id);
  revalidatePath(`/workflows/${data.workflowId}`);
}

export async function toggleSchedule(id: string, enabled: boolean) {
  const schedule = await db.schedule.update({
    where: { id },
    data: { enabled },
  });
  await refreshSchedule(id);
  revalidatePath(`/workflows/${schedule.workflowId}`);
}

export async function deleteSchedule(id: string) {
  const schedule = await db.schedule.delete({ where: { id } });
  unregisterSchedule(id);
  revalidatePath(`/workflows/${schedule.workflowId}`);
}
