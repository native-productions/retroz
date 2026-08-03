"use client";

import * as React from "react";
import { CalendarDayCell } from "@/components/calendar/calendar-day-cell";
import type { CalendarDay, CalendarEntry } from "@/lib/calendar-types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The month as one ruled sheet rather than 42 cards: a single bordered panel
 * divided by hairlines, so the eye reads a calendar instead of a card grid.
 */
export function CalendarMonthGrid({
  weeks,
  selectedDay,
  onSelect,
  onOpen,
}: {
  weeks: CalendarDay[][];
  selectedDay: string | null;
  onSelect: (day: string) => void;
  onOpen: (entry: CalendarEntry) => void;
}) {
  return (
    <div className="retro-card overflow-hidden p-0">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="border-l-2 border-border-soft bg-surface-2 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted first:border-l-0"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Cells rule themselves on the top and left; the first of each row drops
          its rule so the panel's own frame stays the only heavy border. */}
      <div className="grid grid-cols-7 [&>*:nth-child(7n+1)]:border-l-0">
        {weeks.flat().map((day) => (
          <CalendarDayCell
            key={day.day}
            day={day}
            selected={day.day === selectedDay}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
