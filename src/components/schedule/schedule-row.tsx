"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Clock } from "lucide-react";
import { Switch } from "@/components/ui/ui-switch";
import { Badge } from "@/components/ui/ui-badge";
import {
  toggleSchedule,
  deleteSchedule,
} from "@/lib/actions/schedule-actions";

export function ScheduleRow({
  schedule,
}: {
  schedule: {
    id: string;
    label: string;
    enabled: boolean;
    taskNames: string[];
    nextRunLabel: string | null;
  };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(schedule.enabled);
  const [pending, start] = React.useTransition();

  return (
    <div className="retro-card flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 font-display font-semibold">
          <Clock className="size-4 text-secondary" />
          {schedule.label}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted font-mono">
          {schedule.taskNames.length > 0 ? (
            schedule.taskNames.map((n) => (
              <Badge key={n} tone="muted">
                {n}
              </Badge>
            ))
          ) : (
            <span>no task bound</span>
          )}
          {schedule.nextRunLabel ? (
            <span>next: {schedule.nextRunLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            start(async () => {
              await toggleSchedule(schedule.id, v);
              router.refresh();
            });
          }}
          disabled={pending}
        />
        <button
          onClick={() =>
            start(async () => {
              await deleteSchedule(schedule.id);
              router.refresh();
            })
          }
          className="text-fg-muted hover:text-danger"
          title="Delete schedule"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
