"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/ui-dialog";
import { createSchedule } from "@/lib/actions/schedule-actions";

export function ScheduleCreateDialog({
  workflowId,
  tasks,
  variant = "primary",
}: {
  workflowId: string;
  tasks: { id: string; name: string }[];
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [cadence, setCadence] = React.useState<"DAILY" | "WEEKLY" | "MONTHLY">(
    "DAILY",
  );
  const [time, setTime] = React.useState("09:00");
  const [taskId, setTaskId] = React.useState<string>(tasks[0]?.id ?? "none");

  async function submit() {
    setLoading(true);
    await createSchedule({
      workflowId,
      cadence,
      timeOfDay: time,
      timezone: "Asia/Jakarta",
      taskId: taskId === "none" ? null : taskId,
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <CalendarPlus className="size-4" /> New schedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New schedule</DialogTitle>
          <DialogDescription>
            Automatically run a task on a cadence.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cadence">
              <Select
                value={cadence}
                onValueChange={(v) => setCadence(v as typeof cadence)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">Daily</SelectItem>
                  <SelectItem value="WEEKLY">Weekly (Mon)</SelectItem>
                  <SelectItem value="MONTHLY">Monthly (1st)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Time" htmlFor="sch-time">
              <Input
                id="sch-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Task to run" hint="Which task this schedule triggers.">
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— none —</SelectItem>
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={loading}>
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
