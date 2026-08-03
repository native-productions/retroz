"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { LAYER_META } from "@/components/calendar/calendar-layer-meta";
import type { CalendarDay, CalendarEntry } from "@/lib/calendar-types";

/**
 * The month as a list, for widths where seven columns of chips stop being
 * readable. Only days with something on them appear — a phone-sized grid of
 * empty cells is scrolling for nothing.
 */
export function CalendarAgenda({
  weeks,
  onOpen,
}: {
  weeks: CalendarDay[][];
  onOpen: (entry: CalendarEntry) => void;
}) {
  const days = weeks.flat().filter((d) => d.inMonth && d.entries.length > 0);

  if (days.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {days.map((day) => (
        <section key={day.day} className="retro-card p-3">
          <p
            className={cn(
              "font-mono text-[10px] uppercase tracking-wide",
              day.isToday ? "text-accent" : "text-fg-muted",
            )}
          >
            {day.isToday ? "Today · " : ""}
            {day.day}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {day.entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onOpen(entry)}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface p-2 text-left transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-[1px]",
                      LAYER_META[entry.layer].dot,
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs">{entry.title}</span>
                    <span className="block truncate font-mono text-[10px] text-fg-muted">
                      {entry.subtitle}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-fg-muted">
                    {entry.timeLabel}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
