"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import { DatePicker } from "@/components/ui/ui-date-picker";
import { Field } from "@/components/ui/ui-label";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/ui-dialog";
import { LAYER_META } from "@/components/calendar/calendar-layer-meta";
import type { CalendarEntry } from "@/lib/calendar-types";

/**
 * What a chip does when you click it.
 *
 * A bundle opens its publish slot for editing — the calendar owns that date, so
 * it is the one thing changeable from here. Every other layer is a projection
 * of a system that decides its own time, so the dialog only explains it and
 * points at the source.
 */
export function CalendarEntryDialog({
  entry,
  timezone,
  onClose,
  onReschedule,
}: {
  entry: CalendarEntry | null;
  timezone: string;
  onClose: () => void;
  onReschedule: (
    entry: CalendarEntry,
    publishDate: string | null,
    publishTime: string,
  ) => Promise<void>;
}) {
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "clear" | null>(null);

  // Reopening on another chip reseeds the fields; editing then discarding never
  // leaks the previous entry's slot into the next one.
  React.useEffect(() => {
    if (!entry) return;
    setDate(entry.day);
    setTime(entry.timeLabel);
    setBusy(null);
  }, [entry]);

  if (!entry) return null;
  const editable = entry.bundleId !== null;
  const meta = LAYER_META[entry.layer];

  async function commit(next: string | null, mode: "save" | "clear") {
    if (!entry || busy) return;
    setBusy(mode);
    try {
      await onReschedule(entry, next, time || "09:00");
      onClose();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry.title}</DialogTitle>
          <DialogDescription>
            {meta.label} · {entry.subtitle}
            {entry.status ? ` · ${entry.status.toLowerCase()}` : ""}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {editable ? (
            <div className="flex flex-wrap gap-3">
              <Field label="Publish date" htmlFor="calendar-entry-date">
                <DatePicker
                  id="calendar-entry-date"
                  value={date}
                  onChange={setDate}
                  clearable={false}
                  className="w-52"
                />
              </Field>
              <Field
                label="Time"
                htmlFor="calendar-entry-time"
                hint={timezone}
              >
                <Input
                  id="calendar-entry-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-32"
                />
              </Field>
            </div>
          ) : (
            <p className="font-mono text-xs text-fg-muted">
              {entry.day} at {entry.timeLabel} ({timezone}). This one is set
              where it was created, not here.
            </p>
          )}
        </DialogBody>

        <DialogFooter className="justify-between">
          {editable ? (
            <Button
              variant="ghost"
              onClick={() => commit(null, "clear")}
              disabled={busy !== null}
            >
              {busy === "clear" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Clear date
            </Button>
          ) : (
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
          )}

          <div className="flex items-center gap-2">
            {entry.href ? (
              <Button asChild variant="outline">
                <Link href={entry.href}>
                  Open
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            ) : null}
            {editable ? (
              <Button
                onClick={() => commit(date || null, "save")}
                disabled={busy !== null || !date}
              >
                {busy === "save" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                Save
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
