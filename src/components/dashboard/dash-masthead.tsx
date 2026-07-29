import Link from "next/link";
import { MessagesSquare, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/ui-button";

/**
 * The front door's own header. Every other page uses `PageHeader`; the
 * dashboard trades it for a colour block so the app opens on something with
 * weight instead of a text label.
 */
export function DashMasthead({ runsToday }: { runsToday: number }) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <header className="halftone [--halftone-dot:rgba(0,0,0,0.14)] relative overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-primary text-primary-fg shadow-hard">
      <div className="flex flex-wrap items-end justify-between gap-4 p-6">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]">
            {today}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-none tracking-tight sm:text-5xl">
            Control panel
          </h1>
          <p className="mt-3 max-w-[38ch] text-sm leading-relaxed">
            {runsToday > 0
              ? `${runsToday} run${runsToday === 1 ? "" : "s"} today. Everything below is what the machine made.`
              : "Nothing has run today yet. Start a session or fire a task."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="surface" size="sm">
            <Link href="/work">
              <MessagesSquare className="size-4" />
              Open Work
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/workflows">
              <WorkflowIcon className="size-4" />
              New workflow
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
