"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import { CalendarEntryChip } from "@/components/calendar/calendar-entry-chip";
import type { CalendarDay, CalendarEntry } from "@/lib/calendar-types";

/** Chips shown before the cell folds the rest into a "+N" control. */
const VISIBLE = 3;

export function CalendarDayCell({
  day,
  selected,
  onSelect,
  onOpen,
}: {
  day: CalendarDay;
  selected: boolean;
  onSelect: (day: string) => void;
  onOpen: (entry: CalendarEntry) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${day.day}`,
    data: { day: day.day },
  });

  const shown = day.entries.slice(0, VISIBLE);
  const hidden = day.entries.length - shown.length;

  return (
    <div
      ref={setNodeRef}
      onClick={() => onSelect(day.day)}
      className={cn(
        "flex min-h-28 flex-col gap-1 border-t-2 border-l-2 border-border-soft p-1.5",
        "transition-colors duration-150",
        day.inMonth ? "bg-surface" : "bg-surface-2/30",
        day.isPast && day.inMonth && "bg-surface-2/40",
        day.isToday && "bg-accent/5",
        selected && "bg-secondary/10",
        isOver && "bg-primary/15",
      )}
    >
      {/* Only the date. A count beside it reads as a second number in a grid
          made of numbers, and the chips below already are the count. */}
      <span
        className={cn(
          "grid size-5 place-items-center rounded-[3px] font-mono text-[11px] tabular-nums",
          day.isToday && "bg-accent font-semibold text-accent-fg",
          !day.isToday && day.inMonth && "text-fg",
          !day.inMonth && "text-fg-muted/50",
        )}
      >
        {day.dayNumber}
      </span>

      <div className="flex flex-col gap-1">
        {shown.map((entry) => (
          <CalendarEntryChip
            key={entry.id}
            entry={entry}
            dimmed={day.isPast}
            onOpen={onOpen}
          />
        ))}
        {hidden > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(day.day);
            }}
            className="rounded-[4px] px-1 py-[3px] text-left font-mono text-[10px] text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            +{hidden} more
          </button>
        ) : null}
      </div>
    </div>
  );
}
