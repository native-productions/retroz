"use client";

import * as React from "react";
import Link from "next/link";
import { ImageIcon, MessagesSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { Lightbox } from "@/components/run/image-lightbox";
import type { DashGalleryItem } from "@/lib/dashboard-queries";

/**
 * Every PNG the app has rendered, task runs and Work sessions together, newest
 * first. This is the panel no other dashboard has, so it sits directly under
 * the counters: the app opens on the work itself, and the colour on the page is
 * the real output rather than decoration.
 */
export function DashContactSheet({ items }: { items: DashGalleryItem[] }) {
  const [index, setIndex] = React.useState<number | null>(null);

  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <SheetHeading count={0} />
        <div className="rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft px-6 py-10 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full border-2 border-border-soft text-fg-muted">
            <ImageIcon className="size-5" />
          </div>
          <p className="mt-3 font-display text-base font-semibold">
            No images yet
          </p>
          <p className="mx-auto mt-1 max-w-[34ch] text-sm leading-relaxed text-fg-muted">
            Open a Work session and describe a post, or run a task. Every PNG
            Retroz renders lands here.
          </p>
          <Link
            href="/work"
            className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-retro)] border-2 border-border bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg shadow-hard-sm retro-press outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Sparkles className="size-4" />
            Make something
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <SheetHeading count={items.length} />

      {/* Negative margin lets the strip bleed to the page edge, so it reads as
          a roll of film that continues past the viewport. */}
      <div className="-mx-8 overflow-x-auto px-8 pb-2">
        <ul className="flex w-max gap-3">
          {items.map((item, i) => (
            <li key={item.id}>
              <figure className="w-[148px]">
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Open ${item.filename}`}
                  className="block w-full overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 shadow-hard-sm retro-press outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.filename}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/5] w-full object-cover"
                  />
                </button>
                <figcaption className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-[3px]",
                      item.originKind === "work"
                        ? "bg-accent text-accent-fg"
                        : "bg-secondary text-secondary-fg",
                    )}
                    title={item.originKind === "work" ? "Work session" : "Task run"}
                  >
                    {item.originKind === "work" ? (
                      <MessagesSquare className="size-2.5" />
                    ) : (
                      <ImageIcon className="size-2.5" />
                    )}
                  </span>
                  <Link
                    href={item.href}
                    className="min-w-0 flex-1 truncate font-mono text-[10px] text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.origin}
                  </Link>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>

      <Lightbox
        images={items.map((i) => ({
          filename: i.filename,
          relPath: i.relPath,
        }))}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
      />
    </section>
  );
}

function SheetHeading({ count }: { count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg font-bold tracking-tight">
        Contact sheet
      </h2>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted">
        {count > 0 ? `${count} newest renders` : "Nothing rendered"}
      </p>
    </div>
  );
}
