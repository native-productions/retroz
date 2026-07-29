"use client";

import * as React from "react";
import {
  ChartEmpty,
  ChartGrid,
  ChartLegend,
  ChartPanel,
  ChartTooltip,
  TooltipRow,
  fmtCompact,
  fmtUsd,
} from "@/components/dashboard/chart-primitives";
import type { DashTokenDay, DashTokenFacet } from "@/lib/dashboard-queries";

// Fixed categorical order, never cycled. Both steps passed the data-viz checks
// against the light and the dark chart surface.
const IN_COLOR = "var(--chart-1)";
const OUT_COLOR = "var(--chart-2)";

const PLOT_HEIGHT = 104;

/**
 * Token usage over the last 14 days, one small multiple per engine that
 * actually ran. Input and output stack inside a day; cache reads and cost stay
 * in the tooltip so the columns keep a single, honest axis.
 */
export function DashTokenChart({
  facets,
  className,
}: {
  facets: DashTokenFacet[];
  className?: string;
}) {
  // Small multiples only compare if they share a scale.
  const max = Math.max(
    1,
    ...facets.flatMap((f) => f.days.map((d) => d.tokensIn + d.tokensOut)),
  );

  return (
    <ChartPanel
      className={className}
      title="Token usage"
      meta="Last 14 days"
      legend={
        facets.length > 0 ? (
          <ChartLegend
            items={[
              { label: "Input", color: IN_COLOR },
              { label: "Output", color: OUT_COLOR },
            ]}
          />
        ) : undefined
      }
    >
      {facets.length === 0 ? (
        <ChartEmpty
          message="No engine usage yet"
          hint="Run a task or send a message in Work and the spend shows up here, split by engine."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {facets.map((facet) => (
            <Facet key={facet.provider} facet={facet} max={max} />
          ))}
        </div>
      )}
    </ChartPanel>
  );
}

function Facet({ facet, max }: { facet: DashTokenFacet; max: number }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const day = hover === null ? null : facet.days[hover];

  // Only the busiest day gets a direct label; a number on every column is noise.
  const peak = facet.days.reduce(
    (best, d, i) =>
      d.tokensIn + d.tokensOut > facet.days[best].tokensIn + facet.days[best].tokensOut
        ? i
        : best,
    0,
  );
  const peakTotal = facet.days[peak].tokensIn + facet.days[peak].tokensOut;

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">
          {facet.label}
        </span>
        <span className="min-w-0 font-mono text-[10px] text-fg-muted tabular-nums">
          {fmtCompact(facet.totalIn)} in · {fmtCompact(facet.totalOut)} out
          {facet.costUsd > 0 ? ` · ${fmtUsd(facet.costUsd)}` : ""}
        </span>
      </figcaption>

      {/* Facets share one scale so they stay comparable, which leaves the
          quieter engine looking sparse — the axis makes that read as scale
          rather than as a broken panel. The peak label hangs above the tallest
          column, so the plot keeps a top gutter for it. */}
      <div className="mt-4 flex gap-2">
        <div
          className="flex w-10 shrink-0 flex-col justify-between text-right font-mono text-[9px] leading-none text-fg-muted/70 tabular-nums"
          style={{ height: PLOT_HEIGHT }}
          aria-hidden
        >
          <span>{fmtCompact(max)}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            <ChartGrid lines={4} />

            <div className="absolute inset-0 flex items-end gap-[3px]">
              {facet.days.map((d, i) => {
                const total = d.tokensIn + d.tokensOut;
                const height = (total / max) * PLOT_HEIGHT;
                const outHeight = total === 0 ? 0 : (d.tokensOut / total) * height;
                return (
                  <button
                    key={d.day}
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover((h) => (h === i ? null : h))}
                    aria-label={`${d.label}: ${fmtCompact(d.tokensIn)} input, ${fmtCompact(d.tokensOut)} output tokens`}
                    className="group relative flex h-full flex-1 flex-col justify-end outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {total === 0 ? (
                      <span className="h-[2px] w-full rounded-[1px] bg-border-soft" />
                    ) : (
                      <>
                        <span
                          className="w-full rounded-t-[4px]"
                          style={{
                            height: Math.max(outHeight, 2),
                            background: OUT_COLOR,
                          }}
                        />
                        {/* 2px surface gap keeps the two segments legible. */}
                        <span
                          className="w-full bg-surface"
                          style={{ height: 2 }}
                          aria-hidden
                        />
                        <span
                          className="w-full"
                          style={{
                            height: Math.max(height - outHeight - 2, 2),
                            background: IN_COLOR,
                          }}
                        />
                      </>
                    )}
                    {i === peak && peakTotal > 0 ? (
                      <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] font-semibold text-fg-muted tabular-nums">
                        {fmtCompact(peakTotal)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {day ? (
              <ChartTooltip
                x={((hover! + 0.5) / facet.days.length) * 100}
                y={PLOT_HEIGHT - (((day.tokensIn + day.tokensOut) / max) * PLOT_HEIGHT)}
              >
                <TooltipDetail day={day} />
              </ChartTooltip>
            ) : null}
          </div>

          <div className="flex gap-[3px]">
            {facet.days.map((d, i) => (
              <span
                key={d.day}
                className="flex-1 text-center font-mono text-[9px] text-fg-muted/70"
              >
                {/* Every third tick only; 14 labels in a row collide. */}
                {i % 3 === 0 ? d.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

function TooltipDetail({ day }: { day: DashTokenDay }) {
  return (
    <>
      <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wide">
        {day.label}
      </p>
      <TooltipRow label="Input" value={fmtCompact(day.tokensIn)} color={IN_COLOR} />
      <TooltipRow label="Output" value={fmtCompact(day.tokensOut)} color={OUT_COLOR} />
      {day.cacheRead > 0 ? (
        <TooltipRow label="Cache read" value={fmtCompact(day.cacheRead)} />
      ) : null}
      {day.costUsd > 0 ? (
        <TooltipRow label="Cost" value={fmtUsd(day.costUsd)} />
      ) : null}
    </>
  );
}
