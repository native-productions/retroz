"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { WorkAttachment } from "@/lib/work-types";

export interface MentionAnchor {
  /** Viewport coordinates of the caret the menu points at. */
  x: number;
  y: number;
}

/**
 * Caret-anchored list of pasted images. Opens above the caret so the composer
 * text stays visible while picking.
 */
export function WorkMentionMenu({
  items,
  activeIndex,
  anchor,
  onPick,
  onHoverIndex,
}: {
  items: WorkAttachment[];
  activeIndex: number;
  anchor: MentionAnchor;
  onPick: (item: WorkAttachment) => void;
  onHoverIndex: (index: number) => void;
}) {
  // Only ever rendered from a caret interaction, so the document is available.
  if (typeof document === "undefined") return null;

  const left = Math.min(Math.max(anchor.x - 8, 16), window.innerWidth - 296);

  return createPortal(
    <div
      role="listbox"
      aria-label="Pasted images"
      className="wk-pop retro-card fixed z-50 w-[280px] origin-bottom-left overflow-hidden p-1 shadow-hard-lg"
      style={{ left, bottom: window.innerHeight - anchor.y + 10 }}
    >
      <p className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted/70">
        Images
      </p>

      {items.length === 0 ? (
        <div className="flex items-center gap-2 px-2 py-3 text-xs text-fg-muted">
          <ImageOff className="size-4 shrink-0" />
          Nothing to mention yet. Paste an image first.
        </div>
      ) : (
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => onHoverIndex(i)}
              // Mousedown, not click: clicking must not blur the editor first.
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(item);
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left outline-none transition-colors",
                i === activeIndex
                  ? "bg-secondary text-secondary-fg"
                  : "text-fg-muted",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                className="size-8 shrink-0 rounded-[3px] border-2 border-border object-cover"
              />
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">
                {item.name}
              </span>
              {item.origin === "session" ? null : (
                <span
                  className={cn(
                    "shrink-0 font-mono text-[9px] uppercase tracking-wide",
                    i === activeIndex
                      ? "text-secondary-fg/70"
                      : "text-fg-muted/60",
                  )}
                >
                  {item.origin === "global" ? "brand" : "bank"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
