"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Shared chart furniture. The charts are plain HTML/CSS rather than SVG: at
// these sizes the marks are rectangles, and HTML keeps the labels at real font
// size, the hit targets focusable, and the whole thing responsive without a
// resize observer.

/** 12345 → "12.3k", 1234567 → "1.23M". */
export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function fmtUsd(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;
}

/** A bordered panel with a title rule. One per chart. */
export function ChartPanel({
  title,
  meta,
  legend,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  legend?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        // min-w-0 so a long row can never push the panel wider than its grid
        // track; the content truncates or wraps instead of overflowing.
        "flex min-w-0 flex-col rounded-[var(--radius-retro)] border-2 border-border bg-surface shadow-hard",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-border px-4 py-3">
        <h2 className="font-display text-base font-bold tracking-tight">
          {title}
        </h2>
        {meta ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
            {meta}
          </p>
        ) : null}
        {legend ? <div className="w-full">{legend}</div> : null}
      </div>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

export interface LegendItem {
  label: string;
  /** CSS colour for the swatch. */
  color: string;
  /** Status series must carry a glyph too — colour alone is not identity. */
  icon?: React.ReactNode;
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted"
        >
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px] border border-border"
            style={{ background: item.color }}
          />
          {item.icon}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Tooltip anchored to the hovered mark. Rendered inside the chart's relative
 * container, clamped so it never leaves the panel.
 */
export function ChartTooltip({
  x,
  y,
  children,
}: {
  /** Percentage across the plot, 0–100. */
  x: number;
  /** Pixels from the top of the plot. */
  y: number;
  children: React.ReactNode;
}) {
  // A tall mark leaves no room above it, so the tooltip flips under the top of
  // the bar rather than escaping the panel and covering the legend.
  const below = y < 84;

  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-20 min-w-[9rem] -translate-x-1/2 rounded-[var(--radius-retro)] border-2 border-border bg-surface px-2.5 py-2 shadow-hard-sm",
        !below && "-translate-y-full",
      )}
      style={{
        left: `clamp(4.75rem, ${x}%, calc(100% - 4.75rem))`,
        top: below ? y + 10 : Math.max(y - 8, 0),
      }}
    >
      {children}
    </div>
  );
}

export function TooltipRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-[10px] leading-5">
      <span className="flex items-center gap-1.5 text-fg-muted">
        {color ? (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px] border border-border"
            style={{ background: color }}
          />
        ) : null}
        {label}
      </span>
      <span className="font-semibold text-fg tabular-nums">{value}</span>
    </div>
  );
}

/** Recessive baseline + gridlines behind the marks. */
export function ChartGrid({ lines }: { lines: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="absolute inset-x-0 border-t border-border-soft"
          style={{ top: `${(i / (lines - 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

/** Panel-level empty state, so a chart with no data still teaches something. */
export function ChartEmpty({
  message,
  hint,
}: {
  message: string;
  hint?: string;
}) {
  return (
    <div className="grid min-h-[8rem] place-items-center rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft px-4 py-6 text-center">
      <div>
        <p className="text-sm font-semibold">{message}</p>
        {hint ? (
          <p className="mx-auto mt-1 max-w-[32ch] text-xs leading-relaxed text-fg-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
