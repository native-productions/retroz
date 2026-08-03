"use client";

import * as React from "react";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { ArrowUpRight, Images, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/ui-badge";
import { LAYER_META, LAYER_ORDER } from "@/components/calendar/calendar-layer-meta";
import type {
  CalendarDay,
  CalendarEntry,
  CalendarLayer,
  CalendarUnscheduled,
} from "@/lib/calendar-types";

/**
 * The rail beside the month: what the colours mean, what is on the day you
 * clicked, and the bundles still waiting for a date — which are draggable
 * straight onto a cell, so scheduling never needs a form.
 */
export function CalendarSidePanel({
  counts,
  selected,
  unscheduled,
  timezone,
  onOpen,
}: {
  counts: Record<CalendarLayer, number>;
  selected: CalendarDay | null;
  unscheduled: CalendarUnscheduled[];
  timezone: string;
  onOpen: (entry: CalendarEntry) => void;
}) {
  return (
    <aside className="flex flex-col gap-4">
      <section className="retro-card p-3">
        <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
          This month
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {LAYER_ORDER.map((layer) => (
            <li key={layer} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className={cn("size-1.5 rounded-[1px]", LAYER_META[layer].dot)}
              />
              <span className="flex-1 text-fg-muted">
                {LAYER_META[layer].plural}
              </span>
              <span className="font-mono tabular-nums">{counts[layer]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[10px] text-fg-muted">{timezone}</p>
      </section>

      {selected ? (
        <section className="retro-card p-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            {selected.day}
          </p>
          {selected.entries.length === 0 ? (
            <p className="mt-2 text-xs text-fg-muted">
              Nothing here. Drag a bundle onto this day to schedule it.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {selected.entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(entry)}
                    className="flex w-full items-start gap-2 rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface p-2 text-left transition-[transform,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-border active:scale-[0.98]"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1 size-1.5 shrink-0 rounded-[1px]",
                        LAYER_META[entry.layer].dot,
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">
                        {entry.title}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-muted">
                        {entry.timeLabel} · {entry.subtitle}
                      </span>
                    </span>
                    {entry.status ? (
                      <Badge tone="muted" className="px-1.5 py-0 text-[9px]">
                        {entry.status.toLowerCase()}
                      </Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="retro-card p-3">
        <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
          <Inbox className="size-3.5" /> Unscheduled · {unscheduled.length}
        </p>
        {unscheduled.length === 0 ? (
          <p className="mt-2 text-xs text-fg-muted">
            Every bundle has a date. Build another one from a project gallery.
          </p>
        ) : (
          <ul className="mt-2 flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto">
            {unscheduled.map((bundle) => (
              <li key={bundle.id}>
                <UnscheduledCard bundle={bundle} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

/** A dateless bundle: drag it onto a day, or open it to work on the slides. */
function UnscheduledCard({ bundle }: { bundle: CalendarUnscheduled }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unscheduled:${bundle.id}`,
    data: { unscheduled: bundle },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface p-1.5",
        "transition-[transform,border-color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "hover:border-border active:cursor-grabbing active:scale-[0.98]",
        isDragging && "opacity-30",
      )}
    >
      {bundle.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bundle.thumb}
          alt=""
          className="size-8 shrink-0 rounded-[3px] border-2 border-border-soft object-cover"
        />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-[3px] border-2 border-border-soft bg-surface-2 text-fg-muted">
          <Images className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs">{bundle.name}</p>
        <p className="truncate font-mono text-[10px] text-fg-muted">
          {bundle.projectName} · {bundle.slideCount} slide
          {bundle.slideCount === 1 ? "" : "s"}
        </p>
      </div>
      <Link
        href={bundle.href}
        onPointerDown={(e) => e.stopPropagation()}
        title="Open bundle"
        className="shrink-0 rounded-[3px] p-1 text-fg-muted transition-colors duration-150 hover:text-fg"
      >
        <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
}
