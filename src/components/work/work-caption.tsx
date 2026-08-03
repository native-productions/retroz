"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, LoaderCircle, PenLine } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { cn } from "@/lib/cn";
import type { WorkCaption } from "@/lib/work-types";

const MOTION = "duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

const HEIGHT_KEY = "retroz.work.captionHeight";

/** Bounds on the caption box: two lines at the low end, most of the panel at the
 *  high end — the renders below must never be squeezed out entirely. */
const MIN_HEIGHT = 48;
const MAX_HEIGHT = 560;
const DEFAULT_HEIGHT = 176;
/** One keyboard nudge on the divider. */
const STEP = 24;

/** Room the rest of the panel keeps no matter how far the divider is dragged. */
const RESERVED_BELOW = 320;

function clampHeight(value: number): number {
  const ceiling =
    typeof window === "undefined"
      ? MAX_HEIGHT
      : Math.max(
          MIN_HEIGHT,
          Math.min(MAX_HEIGHT, window.innerHeight - RESERVED_BELOW),
        );
  return Math.min(ceiling, Math.max(MIN_HEIGHT, Math.round(value)));
}

/** What lands on the clipboard: the post exactly as it should be pasted. */
export function captionToText(caption: WorkCaption): string {
  const tags = caption.tags.map((t) => `#${t}`).join(" ");
  return tags ? `${caption.text}\n\n${tags}` : caption.text;
}

/**
 * The copy that ships with the renders, between the plan and the images — it is
 * written last but read first, and it is the one thing on this panel the user
 * takes somewhere else, so copying it is a single click.
 */
export function WorkCaptionPanel({
  caption,
  hasRenders,
  busy,
  onGenerate,
}: {
  caption: WorkCaption | null;
  /** Nothing to caption until the session has produced at least one image. */
  hasRenders: boolean;
  /** A turn is already in flight — the agent cannot take a second request. */
  busy: boolean;
  onGenerate: () => void;
}) {
  const [open, setOpen] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [height, setHeight] = React.useState(DEFAULT_HEIGHT);
  const [dragging, setDragging] = React.useState(false);
  // Set once the stored height has been read, so the first paint on the server
  // and the first paint in the browser agree on DEFAULT_HEIGHT.
  const drag = React.useRef<{ startY: number; startHeight: number } | null>(null);

  React.useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(HEIGHT_KEY));
      if (Number.isFinite(stored) && stored > 0) setHeight(clampHeight(stored));
    } catch {
      // storage unavailable — the caption box just opens at its default size
    }
  }, []);

  // Mirrors `height` for the pointer handlers: the value is written on release,
  // and reading it off state there would persist the position before the last
  // move landed.
  const latest = React.useRef(height);
  latest.current = height;

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    drag.current = { startY: e.clientY, startHeight: height };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    const from = drag.current;
    if (!from) return;
    setHeight(clampHeight(from.startHeight + (e.clientY - from.startY)));
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    commitHeight(latest.current);
  }

  function nudge(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      commitHeight(height - STEP);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      commitHeight(height + STEP);
    }
  }

  function commitHeight(next: number) {
    const value = clampHeight(next);
    setHeight(value);
    try {
      localStorage.setItem(HEIGHT_KEY, String(value));
    } catch {
      // storage unavailable — the height simply won't persist
    }
  }

  // Clear the confirmation on its own rather than leaving a stale "copied".
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(captionToText(caption));
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the text stays selectable either way.
    }
  }

  return (
    <section
      className={cn(
        "border-b-2 border-border-soft",
        // A drag that starts on the divider must not select the caption text.
        dragging && "select-none",
      )}
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
            Caption
          </span>
          {caption && caption.tags.length > 0 ? (
            <span className="font-mono text-[10px] text-fg-muted">
              {caption.tags.length} tag{caption.tags.length === 1 ? "" : "s"}
            </span>
          ) : null}
          <span className="flex-1" />
          <ChevronDown
            className={cn(
              "size-3.5 text-fg-muted",
              `transition-transform ${MOTION} motion-reduce:transition-none`,
              !open && "-rotate-90",
            )}
          />
        </button>

        {caption ? (
          <button
            type="button"
            onClick={copy}
            title="Copy caption and hashtags"
            aria-label="Copy caption and hashtags"
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-retro)] text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          >
            {copied ? (
              <Check className="size-3.5 text-primary" strokeWidth={3} />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "grid",
          `transition-[grid-template-rows] ${MOTION} motion-reduce:transition-none`,
        )}
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {caption ? (
            <div className="px-3.5 pb-3.5">
              {/* Sized rather than free-growing: a long caption would otherwise
                  push the renders off the panel. The divider below trades that
                  height against the render grid. */}
              {/* A cap, not a fixed height: a two-line caption should not leave
                  a block of empty panel above the renders. */}
              <p
                style={{ maxHeight: height }}
                className="overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-fg"
              >
                {caption.text}
              </p>
              {caption.tags.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {caption.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border-2 border-border-soft px-2 py-0.5 font-mono text-[10px] text-fg-muted"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="px-3.5 pb-3.5">
              <p className="text-xs leading-relaxed text-fg-muted">
                {hasRenders
                  ? "No caption for these renders yet. Retroz writes one — with up to five hashtags — from the brief and the images above."
                  : "No caption yet. Retroz writes one — with up to five hashtags — once the images for a request are finished."}
              </p>
              {hasRenders ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onGenerate}
                  disabled={busy}
                  className="mt-2.5 w-full"
                >
                  {busy ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Working…
                    </>
                  ) : (
                    <>
                      <PenLine />
                      Generate caption
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* The divider between the caption and the renders. Only offered when
          there is a caption to size — the empty state is already short. */}
      {caption && open ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize caption"
          aria-valuenow={height}
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={MAX_HEIGHT}
          tabIndex={0}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={nudge}
          onDoubleClick={() => commitHeight(DEFAULT_HEIGHT)}
          title="Drag to resize the caption — double-click to reset"
          className="group flex h-2.5 cursor-row-resize touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              "h-0.5 w-10 rounded-full transition-colors",
              dragging
                ? "bg-primary"
                : "bg-border-soft group-hover:bg-fg-muted/60 group-focus-visible:bg-fg-muted/60",
            )}
          />
        </div>
      ) : null}
    </section>
  );
}
