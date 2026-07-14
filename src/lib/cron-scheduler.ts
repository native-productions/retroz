import cron, { type ScheduledTask } from "node-cron";
import { db } from "@/lib/db-client";
import { enqueueRun } from "@/lib/run-queue";
import { computeNextRun, type Cadence } from "@/lib/cron-expr";

// Global registry so HMR / repeated boots don't stack duplicate jobs.
const globalForCron = globalThis as unknown as {
  cronBooted?: boolean;
  cronJobs?: Map<string, ScheduledTask>;
};

function jobs(): Map<string, ScheduledTask> {
  if (!globalForCron.cronJobs) globalForCron.cronJobs = new Map();
  return globalForCron.cronJobs;
}

async function fireSchedule(scheduleId: string): Promise<void> {
  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { tasks: { where: { enabled: true } } },
  });
  if (!schedule || !schedule.enabled) return;

  for (const task of schedule.tasks) {
    const run = await db.taskRun.create({
      data: {
        taskId: task.id,
        status: "QUEUED",
        trigger: "schedule",
        scheduleId: schedule.id,
      },
    });
    enqueueRun(run.id);
  }

  await db.schedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: new Date(),
      nextRunAt: computeNextRun(
        schedule.cadence as Cadence,
        schedule.timeOfDay,
        new Date(),
      ),
    },
  });
}

export function unregisterSchedule(scheduleId: string): void {
  const existing = jobs().get(scheduleId);
  if (existing) {
    existing.stop();
    jobs().delete(scheduleId);
  }
}

export function registerSchedule(schedule: {
  id: string;
  cronExpr: string;
  timezone: string;
  enabled: boolean;
}): void {
  unregisterSchedule(schedule.id);
  if (!schedule.enabled) return;
  if (!cron.validate(schedule.cronExpr)) return;

  const task = cron.schedule(
    schedule.cronExpr,
    () => {
      void fireSchedule(schedule.id);
    },
    { timezone: schedule.timezone },
  );
  jobs().set(schedule.id, task);
}

export async function refreshSchedule(scheduleId: string): Promise<void> {
  const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) {
    unregisterSchedule(scheduleId);
    return;
  }
  registerSchedule(schedule);
}

export async function bootScheduler(): Promise<void> {
  if (globalForCron.cronBooted) return;
  globalForCron.cronBooted = true;
  try {
    const schedules = await db.schedule.findMany({ where: { enabled: true } });
    for (const s of schedules) registerSchedule(s);
    console.log(`[scheduler] boot ok — ${schedules.length} active`);
  } catch (err) {
    console.error("[scheduler] boot failed", err);
  }
}
