"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import { LAYER_META } from "@/components/calendar/calendar-layer-meta";
import type { CalendarEntry } from "@/lib/calendar-types";

/**
 * One scheduled thing inside a day cell.
 *
 * Bundles are draggable because the calendar owns their date; everything else
 * is projected from a system that decides its own time, so those chips only
 * open their source. The two look alike on purpose — the difference shows up
 * on press, not as extra chrome.
 */
export function CalendarEntryChip({
  entry,
  dimmed,
  onOpen,
}: {
  entry: CalendarEntry;
  dimmed?: boolean;
  onOpen: (entry: CalendarEntry) => void;
}) {
  const draggable = entry.bundleId !== null;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id,
    disabled: !draggable,
    data: { entry },
  });

  return (
    <button
      ref={draggable ? setNodeRef : undefined}
      type="button"
      onClick={() => onOpen(entry)}
      title={`${entry.timeLabel} · ${entry.title} — ${entry.subtitle}`}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      className={cn(
        "group/chip flex w-full items-center gap-1.5 rounded-[4px] border-2 border-border-soft bg-surface px-1 py-[3px] text-left",
        "transition-[transform,border-color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "hover:border-border active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        draggable && "cursor-grab active:cursor-grabbing",
        dimmed && "opacity-65",
        // The overlay copy is what follows the pointer; the original stays put
        // as a ghost so the cell never collapses mid-drag.
        isDragging && "opacity-30",
      )}
    >
      <ChipFace entry={entry} />
    </button>
  );
}

/** The chip's contents, shared with the drag overlay. */
export function ChipFace({ entry }: { entry: CalendarEntry }) {
  const meta = LAYER_META[entry.layer];
  return (
    <>
      {entry.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.thumb}
          alt=""
          className="size-5 shrink-0 rounded-[2px] border border-border-soft object-cover"
        />
      ) : (
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-[1px]", meta.dot)}
        />
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] leading-tight">
        {entry.title}
      </span>
      <span className="shrink-0 font-mono text-[9px] text-fg-muted">
        {entry.timeLabel}
      </span>
    </>
  );
}
