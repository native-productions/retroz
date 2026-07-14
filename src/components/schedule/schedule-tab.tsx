import { Clock } from "lucide-react";
import { db } from "@/lib/db-client";
import { EmptyState } from "@/components/page-header";
import { cadenceLabel, type Cadence } from "@/lib/cron-expr";
import { ScheduleCreateDialog } from "@/components/schedule/schedule-create-dialog";
import { ScheduleRow } from "@/components/schedule/schedule-row";

export async function ScheduleTab({ workflowId }: { workflowId: string }) {
  const [schedules, tasks] = await Promise.all([
    db.schedule.findMany({
      where: { workflowId },
      orderBy: { createdAt: "desc" },
      include: { tasks: { select: { name: true } } },
    }),
    db.task.findMany({
      where: { workflowId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {schedules.length} schedule{schedules.length === 1 ? "" : "s"}
        </p>
        <ScheduleCreateDialog workflowId={workflowId} tasks={tasks} />
      </div>

      {schedules.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-6" />}
          title="No schedules"
          description="Create a schedule to run a task automatically — daily, weekly, or monthly."
          action={
            tasks.length > 0 ? (
              <ScheduleCreateDialog
                workflowId={workflowId}
                tasks={tasks}
                variant="secondary"
              />
            ) : (
              <p className="text-xs text-fg-muted font-mono">
                Create a task first.
              </p>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {schedules.map((s) => (
            <ScheduleRow
              key={s.id}
              schedule={{
                id: s.id,
                label: cadenceLabel(s.cadence as Cadence, s.timeOfDay),
                enabled: s.enabled,
                taskNames: s.tasks.map((t) => t.name),
                nextRunLabel: s.nextRunAt
                  ? s.nextRunAt.toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
