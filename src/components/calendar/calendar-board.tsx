"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/ui-button";
import { scheduleWorkBundle } from "@/lib/actions/work-bundle-actions";
import { CalendarAgenda } from "@/components/calendar/calendar-agenda";
import { CalendarEntryDialog } from "@/components/calendar/calendar-entry-dialog";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import { CalendarSidePanel } from "@/components/calendar/calendar-side-panel";
import { ChipFace } from "@/components/calendar/calendar-entry-chip";
import type {
  CalendarDay,
  CalendarEntry,
  CalendarMonth,
  CalendarUnscheduled,
} from "@/lib/calendar-types";
import Link from "next/link";

/** Hour a bundle lands on when it is dragged in without a time of its own. */
const DEFAULT_TIME = "09:00";

/**
 * The month, its rail, and the one piece of state the server cannot hold: what
 * a drag is doing right now.
 *
 * Moves are applied locally the moment the pointer lets go and only then sent,
 * because a bundle sliding back to where it started while a round trip lands is
 * the one thing that makes a calendar feel broken. A failure snaps it back and
 * says why.
 */
export function CalendarBoard({ month }: { month: CalendarMonth }) {
  const router = useRouter();
  const [weeks, setWeeks] = React.useState(month.weeks);
  const [unscheduled, setUnscheduled] = React.useState(month.unscheduled);
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [openEntry, setOpenEntry] = React.useState<CalendarEntry | null>(null);
  const [dragging, setDragging] = React.useState<CalendarEntry | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Every server render hands over a fresh month object, so this resyncs after
  // a refresh and drops whatever the optimistic pass was holding.
  React.useEffect(() => {
    setWeeks(month.weeks);
    setUnscheduled(month.unscheduled);
  }, [month]);

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a chip click still opens
    // its dialog instead of nudging the bundle onto a neighbouring day.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const selected = React.useMemo(
    () => weeks.flat().find((d) => d.day === selectedDay) ?? null,
    [weeks, selectedDay],
  );

  const total = React.useMemo(
    () => weeks.flat().reduce((sum, d) => sum + d.entries.length, 0),
    [weeks],
  );

  function revert() {
    setWeeks(month.weeks);
    setUnscheduled(month.unscheduled);
  }

  async function commit(
    bundleId: string,
    publishDate: string | null,
    publishTime: string,
  ) {
    setError(null);
    try {
      await scheduleWorkBundle({ id: bundleId, publishDate, publishTime });
      router.refresh();
    } catch (cause) {
      revert();
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not move that bundle. Nothing was changed.",
      );
    }
  }

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.entry) {
      setDragging(data.entry as CalendarEntry);
      return;
    }
    const bundle = data?.unscheduled as CalendarUnscheduled | undefined;
    if (bundle) setDragging(asEntry(bundle, "", DEFAULT_TIME));
  }

  async function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const day = event.over?.data.current?.day as string | undefined;
    if (!day) return;

    const data = event.active.data.current;
    const entry = data?.entry as CalendarEntry | undefined;
    if (entry?.bundleId) {
      if (entry.day === day) return;
      setWeeks((prev) => moveEntry(prev, entry.id, day));
      await commit(entry.bundleId, day, entry.timeLabel);
      return;
    }

    const bundle = data?.unscheduled as CalendarUnscheduled | undefined;
    if (!bundle) return;
    setUnscheduled((prev) => prev.filter((b) => b.id !== bundle.id));
    setWeeks((prev) => insertEntry(prev, asEntry(bundle, day, DEFAULT_TIME)));
    await commit(bundle.id, day, DEFAULT_TIME);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {error ? (
        <p className="mb-3 rounded-[var(--radius-retro)] border-2 border-danger px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          {total === 0 && unscheduled.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-6" />}
              title="Nothing scheduled this month"
              description="Bundles with a publish date land here, alongside the runs your schedules and campaigns will fire."
              action={
                <Button asChild variant="secondary">
                  <Link href="/work">Go to Work</Link>
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden sm:block">
                <CalendarMonthGrid
                  weeks={weeks}
                  selectedDay={selectedDay}
                  onSelect={setSelectedDay}
                  onOpen={setOpenEntry}
                />
              </div>
              <div className="sm:hidden">
                <CalendarAgenda weeks={weeks} onOpen={setOpenEntry} />
              </div>
            </>
          )}
        </div>

        <CalendarSidePanel
          counts={month.counts}
          selected={selected}
          unscheduled={unscheduled}
          timezone={month.timezone}
          onOpen={setOpenEntry}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="flex w-44 items-center gap-1.5 rounded-[4px] border-2 border-border bg-surface px-1 py-[3px] shadow-hard-sm">
            <ChipFace entry={dragging} />
          </div>
        ) : null}
      </DragOverlay>

      <CalendarEntryDialog
        entry={openEntry}
        timezone={month.timezone}
        onClose={() => setOpenEntry(null)}
        onReschedule={async (entry, publishDate, publishTime) => {
          if (!entry.bundleId) return;
          if (publishDate === null) {
            setWeeks((prev) => removeEntry(prev, entry.id));
          } else if (publishDate !== entry.day) {
            setWeeks((prev) => moveEntry(prev, entry.id, publishDate));
          }
          await commit(entry.bundleId, publishDate, publishTime);
        }}
      />
    </DndContext>
  );
}

// --- local grid edits ------------------------------------------------------
// Cheap structural updates so a drag reads instantly. The server remains the
// source of truth: the next render replaces all of this wholesale.

/** Chips inside a day are ordered by time, and a day never spans midnight. */
function sortByTime(entries: CalendarEntry[]): CalendarEntry[] {
  return [...entries].sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
}

function mapDays(
  weeks: CalendarDay[][],
  fn: (day: CalendarDay) => CalendarDay,
): CalendarDay[][] {
  return weeks.map((week) => week.map(fn));
}

function removeEntry(weeks: CalendarDay[][], entryId: string): CalendarDay[][] {
  return mapDays(weeks, (day) =>
    day.entries.some((e) => e.id === entryId)
      ? { ...day, entries: day.entries.filter((e) => e.id !== entryId) }
      : day,
  );
}

function insertEntry(
  weeks: CalendarDay[][],
  entry: CalendarEntry,
): CalendarDay[][] {
  return mapDays(weeks, (day) =>
    day.day === entry.day
      ? { ...day, entries: sortByTime([...day.entries, entry]) }
      : day,
  );
}

function moveEntry(
  weeks: CalendarDay[][],
  entryId: string,
  toDay: string,
): CalendarDay[][] {
  const found = weeks.flat().flatMap((d) => d.entries).find((e) => e.id === entryId);
  if (!found) return weeks;
  return insertEntry(removeEntry(weeks, entryId), { ...found, day: toDay });
}

/** The chip a dateless bundle becomes once it lands on a day. */
function asEntry(
  bundle: CalendarUnscheduled,
  day: string,
  time: string,
): CalendarEntry {
  return {
    id: `bundle:${bundle.id}`,
    layer: "bundle",
    day,
    atISO: "",
    timeLabel: time,
    title: bundle.name,
    subtitle: `${bundle.projectName} · ${bundle.slideCount} slide${
      bundle.slideCount === 1 ? "" : "s"
    }`,
    status: null,
    thumb: bundle.thumb,
    href: bundle.href,
    bundleId: bundle.id,
  };
}
