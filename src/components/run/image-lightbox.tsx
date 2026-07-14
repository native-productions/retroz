"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { mediaUrl } from "@/lib/media";

export interface LightboxImage {
  filename: string;
  relPath: string;
}

/** Full-screen image viewer with prev/next carousel + keyboard nav. */
export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const current = open ? images[index] : undefined;
  const count = images.length;

  const go = React.useCallback(
    (delta: number) => {
      if (index === null || count === 0) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <DialogPrimitive.Content
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,56rem)] -translate-x-1/2 -translate-y-1/2 retro-card shadow-hard-lg p-0 max-h-[92vh] overflow-hidden flex flex-col"
        >
          <DialogPrimitive.Title className="sr-only">
            {current?.filename ?? "Image viewer"}
          </DialogPrimitive.Title>

          <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-surface-2 px-4 py-2.5">
            <span className="truncate font-mono text-xs font-semibold">
              {current?.filename}
            </span>
            <div className="flex items-center gap-2">
              {count > 1 ? (
                <span className="font-mono text-[10px] text-fg-muted">
                  {(index ?? 0) + 1} / {count}
                </span>
              ) : null}
              <DialogPrimitive.Close className="rounded-[var(--radius-retro)] border-2 border-border bg-surface p-1 retro-press">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="relative flex-1 overflow-auto bg-surface-2 p-4 flex items-center justify-center">
            {current ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl(current.relPath)}
                alt={current.filename}
                className="max-h-[74vh] w-auto rounded-[4px] border-2 border-border object-contain"
              />
            ) : null}

            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous image"
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-[var(--radius-retro)] border-2 border-border bg-surface p-1.5 retro-press"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next image"
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-[var(--radius-retro)] border-2 border-border bg-surface p-1.5 retro-press"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
