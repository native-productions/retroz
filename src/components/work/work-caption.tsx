"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, LoaderCircle, PenLine } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { cn } from "@/lib/cn";
import type { WorkCaption } from "@/lib/work-types";

const MOTION = "duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

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
    <section className="border-b-2 border-border-soft">
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
              {/* Capped rather than free-growing: a long caption would otherwise
                  push the renders off the panel. */}
              <p className="max-h-44 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-fg">
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
    </section>
  );
}
