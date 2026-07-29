"use client";

import * as React from "react";
import Link from "next/link";
import { Ban, CircleCheck, TriangleAlert } from "lucide-react";
import {
  ChartEmpty,
  ChartLegend,
  ChartPanel,
} from "@/components/dashboard/chart-primitives";
import type { DashWorkflowRuns } from "@/lib/dashboard-queries";

// Reserved status palette — never reused as a categorical series colour, and
// always shipped with a glyph and a label so identity is never colour alone
// (green and red are the classic colour-vision collision).
const SEGMENTS = [
  { key: "done", label: "Done", color: "var(--chart-3)", icon: CircleCheck },
  { key: "failed", label: "Failed", color: "var(--danger)", icon: TriangleAlert },
  { key: "cancelled", label: "Cancelled", color: "var(--fg-muted)", icon: Ban },
] as const;

/**
 * Which workflow produces, and which one keeps breaking. Horizontal stacked
 * bars share one scale, so bar length is comparable across rows.
 */
export function DashRunsChart({
  rows,
  className,
}: {
  rows: DashWorkflowRuns[];
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <ChartPanel
      className={className}
      title="Runs by workflow"
      meta="All time"
      legend={
        rows.length > 0 ? (
          <ChartLegend
            items={SEGMENTS.map((s) => ({
              label: s.label,
              color: s.color,
              icon: <s.icon className="size-3" aria-hidden />,
            }))}
          />
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty
          message="No finished runs yet"
          hint="Once a task run completes, its workflow appears here with the outcome split."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <Row key={row.id} row={row} max={max} />
          ))}
        </ul>
      )}
    </ChartPanel>
  );
}

function Row({ row, max }: { row: DashWorkflowRuns; max: number }) {
  const counts: Record<string, number> = {
    done: row.done,
    failed: row.failed,
    cancelled: row.cancelled,
  };

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <Link
          href={`/workflows/${row.id}`}
          className="min-w-0 flex-1 truncate text-[13px] font-semibold outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.name}
        </Link>
        {/* The counts live here, not inside the fills: text on a saturated
            segment would have to clear contrast in both themes, and the
            outcome split is the thing worth reading precisely. */}
        <span className="flex flex-wrap items-center gap-x-2.5 font-mono text-[10px] text-fg-muted tabular-nums">
          {SEGMENTS.map((seg) =>
            counts[seg.key] > 0 ? (
              <span key={seg.key} className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="size-2 rounded-[2px] border border-border"
                  style={{ background: seg.color }}
                />
                {counts[seg.key]} {seg.label.toLowerCase()}
              </span>
            ) : null,
          )}
        </span>
      </div>

      <div
        className="flex h-5 items-stretch gap-[2px] overflow-hidden rounded-[4px] border-2 border-border"
        style={{ width: `${Math.max((row.total / max) * 100, 8)}%` }}
      >
        {SEGMENTS.map((seg) => {
          const value = counts[seg.key];
          if (value === 0) return null;
          return (
            <span
              key={seg.key}
              title={`${value} ${seg.label.toLowerCase()}`}
              style={{
                width: `${(value / row.total) * 100}%`,
                background: seg.color,
              }}
            />
          );
        })}
      </div>
    </li>
  );
}
