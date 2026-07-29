import Link from "next/link";
import { cn } from "@/lib/cn";
import type { DashCounter } from "@/lib/dashboard-queries";

const TONE: Record<DashCounter["tone"], string> = {
  primary: "bg-primary text-primary-fg",
  secondary: "bg-secondary text-secondary-fg",
  accent: "bg-accent text-accent-fg",
  surface: "bg-surface text-fg",
};

/**
 * One band split into unequal colour cells rather than a row of identical
 * cards. The widths are deliberately uneven so it reads as a printed index,
 * and only three cells carry a saturated fill — enough colour to set the tone
 * without putting every number on a bright ground.
 */
export function DashCounters({ counters }: { counters: DashCounter[] }) {
  return (
    <nav
      aria-label="Library totals"
      // The 2px gaps sit on a border-coloured ground, so the rules survive the
      // wrap at narrow widths where per-cell borders would leave seams open.
      className="flex flex-wrap gap-[2px] overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-border shadow-hard"
    >
      {counters.map((counter) => (
        <Link
          key={counter.key}
          href={counter.href}
          style={{ flexGrow: counter.span, flexBasis: `${counter.span * 12}px` }}
          className={cn(
            "group relative min-w-[7.5rem] px-4 py-4 outline-none transition-[filter] duration-150 ease-out hover:brightness-105 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            TONE[counter.tone],
          )}
        >
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
            {counter.label}
          </p>
          <p className="mt-1 font-display text-3xl font-bold leading-none tabular-nums">
            {counter.value}
          </p>
        </Link>
      ))}
    </nav>
  );
}
