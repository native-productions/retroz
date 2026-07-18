import Link from "next/link";
import { Clock, CalendarRange } from "lucide-react";
import { db } from "@/lib/db-client";
import { EmptyState } from "@/components/page-header";
import { cadenceLabel, type Cadence } from "@/lib/cron-expr";
import { formatInTz } from "@/lib/campaign-time";
import { CampaignStatusBadge } from "@/components/campaign/campaign-status-badge";
import { ScheduleCreateDialog } from "@/components/schedule/schedule-create-dialog";
import { ScheduleRow } from "@/components/schedule/schedule-row";

export async function ScheduleTab({ workflowId }: { workflowId: string }) {
  const [schedules, tasks, campaigns] = await Promise.all([
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
    // Campaign schedules are materialized (ticker-driven), not cron rows — surface
    // them here too so every scheduled run lives in one place.
    db.campaign.findMany({
      where: {
        workflowId,
        status: { in: ["SCHEDULED", "RUNNING", "COMPLETED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: { select: { status: true, scheduledAt: true } },
      },
    }),
  ]);

  const isEmpty = schedules.length === 0 && campaigns.length === 0;
  const total = schedules.length + campaigns.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {total} schedule{total === 1 ? "" : "s"}
        </p>
        <ScheduleCreateDialog workflowId={workflowId} tasks={tasks} />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<Clock className="size-6" />}
          title="No schedules"
          description="Run a task automatically on a cadence, or plan a multi-day campaign from the Plan tab."
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

          {campaigns.map((c) => {
            const upcoming = c.items
              .filter((i) => i.status === "SCHEDULED" && i.scheduledAt)
              .map((i) => i.scheduledAt as Date)
              .sort((a, b) => a.getTime() - b.getTime())[0];
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="retro-card flex items-center justify-between gap-3 p-4 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 font-display font-semibold">
                    <CalendarRange className="size-4 text-accent" />
                    {c.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-fg-muted">
                    <span>
                      {c.durationDays ?? 0}d · {c.slotTimes.length}/day at{" "}
                      {c.slotTimes.join(", ")} · {c.timezone}
                    </span>
                    {upcoming ? (
                      <span>next: {formatInTz(upcoming, c.timezone)}</span>
                    ) : null}
                  </div>
                </div>
                <CampaignStatusBadge status={c.status} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
