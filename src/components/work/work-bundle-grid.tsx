"use client";

import Link from "next/link";
import { Images, Layers, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/ui-button";
import { CAROUSEL_LIMIT, type WorkBundleSummary } from "@/lib/work-types";

/**
 * A project's bundles. Each card previews its first three slides as a stack,
 * because what identifies a carousel is its opening frames, not its title.
 */
export function WorkBundleGrid({
  projectId,
  bundles,
}: {
  projectId: string;
  bundles: WorkBundleSummary[];
}) {
  if (bundles.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full border-2 border-border-soft text-fg-muted">
            <Layers className="size-5" />
          </div>
          <h2 className="mt-4 font-display text-lg font-bold tracking-tight">
            No bundles yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            A bundle is an ordered set of renders, ready to go up as one
            Instagram carousel. Pick some in the gallery to start one.
          </p>
          <div className="mt-6">
            <Button size="sm" asChild>
              <Link href={`/work/p/${projectId}/gallery`}>
                <Images className="size-4" />
                Open gallery
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
        {bundles.map((bundle) => (
          <Link
            key={bundle.id}
            href={`/work/p/${projectId}/bundles/${bundle.id}`}
            className="retro-card retro-press flex flex-col gap-3 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CoverStack covers={bundle.covers} />

            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold leading-tight">
                {bundle.name}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-fg-muted">
                <span
                  className={cn(
                    "tabular-nums",
                    bundle.count > CAROUSEL_LIMIT && "text-danger",
                  )}
                >
                  {bundle.count} slide{bundle.count === 1 ? "" : "s"}
                </span>
                {bundle.ratio ? <span>· {bundle.ratio}</span> : null}
                <span>· {bundle.updatedLabel}</span>
              </p>
              {bundle.mixedRatio ? (
                <p className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-danger">
                  <TriangleAlert className="size-3" />
                  mixed ratios
                </p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CoverStack({ covers }: { covers: { id: string; url: string }[] }) {
  if (covers.length === 0) {
    return (
      <div className="grid aspect-[4/5] w-full place-items-center rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft text-fg-muted">
        <Images className="size-5" />
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/5] w-full">
      {covers.map((cover, i) => (
        <div
          key={cover.id}
          className="absolute inset-0 overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-surface-2"
          style={{
            // Later covers sit behind, peeking out to the right — a deck, read
            // top card first.
            transform: `translateX(${i * 8}px) translateY(${i * -4}px)`,
            zIndex: covers.length - i,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.url}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}
