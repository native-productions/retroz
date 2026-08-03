"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const CELLS = 42; // six Monday-first rows, so the grid never reflows mid-month

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * All maths runs in UTC on purpose: a picked day is a wall-clock date string,
 * never an instant. Building the grid with local-time `Date` would shift a day
 * across a DST edge, which is exactly the bug `campaign-time` exists to avoid.
 */
function ymd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseYmd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Today as the browser sees it — used only to mark the cell. */
function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthDays(year: number, month: number): string[] {
  // Back up to the Monday on or before the 1st, then walk six weeks forward.
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - offset));
  return Array.from({ length: CELLS }, (_, i) =>
    ymd(new Date(Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate() + i,
    ))),
  );
}

/**
 * Calendar picker for a `YYYY-MM-DD` value.
 *
 * Replaces `<input type="date">`, whose look and month grid are the browser's,
 * not ours — and whose text field invites a typed date in whatever order the
 * locale guessed. Here the only way to answer is to pick a day.
 */
export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Pick a date",
  clearable = true,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  /** "YYYY-MM-DD", or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  /** Offers a Clear action in the footer when a date is set. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseYmd(value);
  const [view, setView] = React.useState(() => selected ?? new Date());

  // Opening on a month far from the selected date is disorienting: every open
  // starts where the current answer lives.
  React.useEffect(() => {
    if (!open) return;
    setView(parseYmd(value) ?? new Date());
  }, [open, value]);

  const year = view.getUTCFullYear();
  const month = view.getUTCMonth();
  const days = React.useMemo(() => monthDays(year, month), [year, month]);
  const today = todayYmd();

  function shift(by: number) {
    setView(new Date(Date.UTC(year, month + by, 1)));
  }

  function pick(day: string) {
    onChange(day);
    setOpen(false);
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-[var(--radius-retro)] border-2 border-border bg-surface px-3 text-left text-sm text-fg outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-fg-muted" />
          <span
            className={cn("min-w-0 flex-1 truncate", !selected && "text-fg-muted/60")}
          >
            {selected ? LABEL.format(selected) : placeholder}
          </span>
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="retro-card z-50 w-[17.5rem] p-3 shadow-hard-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <NavButton label="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft className="size-4" />
            </NavButton>
            <span className="font-display text-sm font-bold">
              {MONTH_LABEL.format(new Date(Date.UTC(year, month, 1)))}
            </span>
            <NavButton label="Next month" onClick={() => shift(1)}>
              <ChevronRight className="size-4" />
            </NavButton>
          </div>

          <div className="mt-2.5 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((label, i) => (
              <span
                key={i}
                aria-hidden
                className="grid h-6 place-items-center font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted/70"
              >
                {label}
              </span>
            ))}

            {days.map((day) => {
              const inMonth = Number(day.slice(5, 7)) === month + 1;
              const isSelected = day === value;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  aria-label={LABEL.format(parseYmd(day) as Date)}
                  aria-current={day === today ? "date" : undefined}
                  aria-pressed={isSelected}
                  className={cn(
                    "grid h-8 place-items-center rounded-[4px] border-2 border-transparent font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                    inMonth ? "text-fg" : "text-fg-muted/40",
                    !isSelected && "hover:bg-surface-2",
                    day === today && !isSelected && "border-border-soft font-bold",
                    isSelected &&
                      "border-border bg-primary font-bold text-primary-fg shadow-hard-sm",
                  )}
                >
                  {Number(day.slice(8, 10))}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t-2 border-border-soft pt-2.5">
            <button
              type="button"
              onClick={() => pick(today)}
              className="rounded-[4px] px-1.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
            >
              Today
            </button>
            {clearable && value ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted outline-none transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" />
                Clear
              </button>
            ) : null}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-7 place-items-center rounded-[4px] border-2 border-border bg-surface text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
    >
      {children}
    </button>
  );
}
