import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarRange, MessagesSquare, Workflow as WorkflowIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { RunStatusBadge } from "@/components/run/run-status-badge";
import { CampaignStatusBadge } from "@/components/campaign/campaign-status-badge";
import type {
  DashRecentCampaign,
  DashRecentRun,
  DashRecentSession,
  DashRecentWorkflow,
} from "@/lib/dashboard-queries";

type Accent = "primary" | "secondary" | "accent";

const RULE: Record<Accent, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  accent: "bg-accent",
};

/**
 * A column of compact rows. Cards would nest inside the page's panels; a
 * coloured rule plus mono rows keeps the density high and the hierarchy flat.
 */
function Column({
  title,
  accent,
  icon,
  href,
  hrefLabel,
  empty,
  children,
}: {
  title: string;
  accent: Accent;
  icon: React.ReactNode;
  href: string;
  hrefLabel: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasRows = React.Children.count(children) > 0;
  return (
    <section className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2">
        <span className="text-fg-muted">{icon}</span>
        <h2 className="flex-1 font-display text-sm font-bold uppercase tracking-wide">
          {title}
        </h2>
        <Link
          href={href}
          className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
        >
          {hrefLabel}
          <ArrowRight className="size-3" />
        </Link>
      </div>
      <span className={cn("mt-2 h-1 w-full rounded-full", RULE[accent])} />

      {hasRows ? (
        <ul className="mt-2 flex flex-col divide-y-2 divide-border-soft">
          {children}
        </ul>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-fg-muted">{empty}</p>
      )}
    </section>
  );
}

function Row({
  href,
  title,
  meta,
  trailing,
}: {
  href: string;
  title: React.ReactNode;
  meta: string;
  trailing?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-[4px] py-2 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">
            {title}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-muted">
            {meta}
          </span>
        </span>
        {trailing}
      </Link>
    </li>
  );
}

export function DashRecent({
  sessions,
  workflows,
  campaigns,
}: {
  sessions: DashRecentSession[];
  workflows: DashRecentWorkflow[];
  campaigns: DashRecentCampaign[];
}) {
  return (
    <div className="grid gap-x-8 gap-y-7 rounded-[var(--radius-retro)] border-2 border-border bg-surface p-5 shadow-hard md:grid-cols-2 xl:grid-cols-3">
      <Column
        title="Conversations"
        accent="accent"
        icon={<MessagesSquare className="size-3.5" />}
        href="/work"
        hrefLabel="Work"
        empty="No sessions yet. Open Work and paste a photo to start one."
      >
        {sessions.map((s) => (
          <Row
            key={s.id}
            href={`/work/${s.id}`}
            title={s.title}
            meta={`${s.projectName} · ${s.when}`}
            trailing={
              s.status === "running" ? (
                <span className="relative flex size-2 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
              ) : s.status === "error" ? (
                <span className="size-2 shrink-0 rounded-full bg-danger" />
              ) : null
            }
          />
        ))}
      </Column>

      <Column
        title="Workflows"
        accent="secondary"
        icon={<WorkflowIcon className="size-3.5" />}
        href="/workflows"
        hrefLabel="All"
        empty="No workflows yet. A workflow holds the brand voice for one channel."
      >
        {workflows.map((w) => (
          <Row
            key={w.id}
            href={`/workflows/${w.id}`}
            title={w.name}
            meta={`${w.platform} · ${w.tasks} task${w.tasks === 1 ? "" : "s"} · ${w.campaigns} campaign${w.campaigns === 1 ? "" : "s"}`}
          />
        ))}
      </Column>

      <Column
        title="Campaigns"
        accent="primary"
        icon={<CalendarRange className="size-3.5" />}
        href="/workflows"
        hrefLabel="All"
        empty="No campaigns yet. Plan one from a workflow to schedule a week of posts."
      >
        {campaigns.map((c) => (
          <Row
            key={c.id}
            href={`/campaigns/${c.id}`}
            title={c.name}
            meta={`${c.workflowName} · ${c.items} item${c.items === 1 ? "" : "s"}`}
            trailing={<CampaignStatusBadge status={c.status} />}
          />
        ))}
      </Column>
    </div>
  );
}

/** Full-width ticker of the newest production runs. */
export function DashRunTicker({ runs }: { runs: DashRecentRun[] }) {
  if (runs.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">
          Latest runs
        </h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted">
          Newest first
        </p>
      </div>
      <ul className="overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-surface shadow-hard">
        {runs.map((run, i) => (
          <li key={run.id} className={cn(i > 0 && "border-t-2 border-border-soft")}>
            <Link
              href={`/runs/${run.id}`}
              className="flex items-center gap-4 px-4 py-2.5 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {run.taskName}
              </span>
              <span className="hidden min-w-0 flex-1 truncate font-mono text-[10px] text-fg-muted sm:block">
                {run.workflowName}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-fg-muted tabular-nums">
                {run.when}
              </span>
              <RunStatusBadge status={run.status} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
