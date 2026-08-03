import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";
import { LAYER_META } from "@/components/calendar/calendar-layer-meta";
import type { CalendarEntry, CalendarStrip } from "@/lib/calendar-types";

/** Dots a cell shows before it collapses the rest into a count. */
const DOTS = 3;

/**
 * The next two weeks, above the fold.
 *
 * The front page answers "what is coming"; the month view answers "when
 * exactly". So this is a strip, not a grid: each day is a column of coloured
 * dots you read in one pass, and the nearest few entries are spelled out beside
 * it. Every cell links into the month view rather than editing anything — the
 * dashboard is a place to look, not to work.
 */
export function DashCalendar({ strip }: { strip: CalendarStrip }) {
  const busiest = strip.days.reduce(
    (max, d) => Math.max(max, d.entries.length),
    0,
  );

  return (
    <section className="rounded-[var(--radius-retro)] border-2 border-border bg-surface p-5 shadow-hard">
      <div className="flex items-center gap-2">
        <span className="text-fg-muted">
          <CalendarDays className="size-3.5" />
        </span>
        <h2 className="flex-1 font-display text-sm font-bold uppercase tracking-wide">
          Coming up
        </h2>
        <span className="font-mono text-[10px] text-fg-muted">
          {strip.timezone}
        </span>
        <Link
          href={`/calendar?m=${strip.month}`}
          className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
        >
          Calendar
          <ArrowRight className="size-3" />
        </Link>
      </div>
      <span className="mt-2 block h-1 w-full rounded-full bg-secondary" />

      <div className="mt-4 grid items-start gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* Fourteen columns need real width; below xl the strip scrolls rather
            than squeezing each day into an unreadable sliver. */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <ul className="flex min-w-[34rem] gap-1">
            {strip.days.map((day) => (
              <li key={day.day} className="min-w-0 flex-1">
                <Link
                  href={`/calendar?m=${day.day.slice(0, 7)}`}
                  title={`${day.entries.length} on ${day.day}`}
                  className={cn(
                    "flex h-full flex-col items-center gap-1 rounded-[4px] border-2 px-1 py-1.5 outline-none",
                    "transition-[transform,border-color,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                    "hover:border-border active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring",
                    day.isToday
                      ? "border-border bg-surface-2"
                      : "border-border-soft bg-surface",
                  )}
                >
                  <span className="font-mono text-[9px] uppercase tracking-wide text-fg-muted">
                    {/* Weekdays all the way across, except where the month
                        turns over — the masthead above already names today's. */}
                    {day.dayNumber === 1 ? day.monthLabel : day.weekdayLabel}
                  </span>
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-[3px] font-mono text-xs tabular-nums",
                      day.isToday && "bg-accent font-semibold text-accent-fg",
                    )}
                  >
                    {day.dayNumber}
                  </span>
                  <Dots entries={day.entries} />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          {strip.upcoming.length === 0 ? (
            <p className="text-xs leading-relaxed text-fg-muted">
              {busiest === 0
                ? "Nothing scheduled in the next two weeks. Give a bundle a publish date, or put a task on a schedule."
                : "Everything in this window has already run."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y-2 divide-border-soft">
              {strip.upcoming.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={entry.href ?? `/calendar?m=${strip.month}`}
                    className="flex items-center gap-3 rounded-[4px] py-2 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-[1px]",
                        LAYER_META[entry.layer].dot,
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">
                        {entry.title}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-muted">
                        {LAYER_META[entry.layer].label} · {entry.subtitle}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-muted">
                      {entry.day.slice(8)}/{entry.day.slice(5, 7)}{" "}
                      {entry.timeLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** A day's load, as dots. Empty days keep the row's height with a hairline. */
function Dots({ entries }: { entries: CalendarEntry[] }) {
  if (entries.length === 0) {
    return <span aria-hidden className="h-1.5 w-3 rounded-full bg-border-soft" />;
  }

  const shown = entries.slice(0, DOTS);
  const hidden = entries.length - shown.length;

  return (
    <span className="flex h-1.5 items-center gap-0.5">
      {shown.map((entry) => (
        <span
          key={entry.id}
          aria-hidden
          className={cn("size-1.5 rounded-[1px]", LAYER_META[entry.layer].dot)}
        />
      ))}
      {hidden > 0 ? (
        <span className="font-mono text-[8px] leading-none text-fg-muted">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
