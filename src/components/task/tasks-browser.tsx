"use client";

import * as React from "react";
import Link from "next/link";
import {
  Rocket,
  FolderOpen,
  Cpu,
  Play,
  Trash2,
  Search,
  ChevronRight,
  CalendarRange,
  CalendarClock,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/ui-card";
import { Badge } from "@/components/ui/ui-badge";
import { Input } from "@/components/ui/ui-input";
import { ActionButton } from "@/components/ui/ui-action-button";
import { CampaignStatusBadge } from "@/components/campaign/campaign-status-badge";
import { TaskCreateDialog } from "@/components/task/task-create-dialog";
import { CampaignCreateDialog } from "@/components/campaign/campaign-create-dialog";
import { triggerRun, deleteTask } from "@/lib/actions/task-actions";

interface TaskLite {
  id: string;
  name: string;
  folderName: string | null;
  model: string;
  runs: number;
  campaignId: string | null;
  campaignName: string | null;
  dayIndex: number | null;
  slotIndex: number | null;
}

interface CampaignLite {
  id: string;
  name: string;
  status: string;
  items: number;
  durationDays: number | null;
  slotsPerDay: number | null;
}

type Group = "tasks" | "campaign";

export function TasksBrowser({
  workflowId,
  folders,
  tasks,
  campaigns,
}: {
  workflowId: string;
  folders: { id: string; name: string }[];
  tasks: TaskLite[];
  campaigns: CampaignLite[];
}) {
  const [group, setGroup] = React.useState<Group>("tasks");
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();

  const standalone = React.useMemo(
    () => tasks.filter((t) => !t.campaignId),
    [tasks],
  );

  const matchesTask = React.useCallback(
    (t: TaskLite) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      (t.folderName?.toLowerCase().includes(q) ?? false),
    [q],
  );

  const visibleStandalone = React.useMemo(
    () => standalone.filter(matchesTask),
    [standalone, matchesTask],
  );

  // Campaign group: each campaign with its materialized tasks, filtered by query.
  const campaignGroups = React.useMemo(() => {
    return campaigns
      .map((c) => {
        const campaignTasks = tasks.filter((t) => t.campaignId === c.id);
        const nameHit = !q || c.name.toLowerCase().includes(q);
        const taskHits = campaignTasks.filter(matchesTask);
        return { campaign: c, tasks: nameHit ? campaignTasks : taskHits, nameHit };
      })
      // With an active query, hide campaigns that match neither by name nor task.
      .filter((g) => !q || g.nameHit || g.tasks.length > 0);
  }, [campaigns, tasks, q, matchesTask]);

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks and campaigns…"
          aria-label="Search tasks and campaigns"
          className="h-12 pl-11 text-base"
        />
      </div>

      {/* Group switch + contextual create */}
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Group tasks"
          className="inline-flex items-center gap-1 rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 p-1"
        >
          <GroupTab
            active={group === "tasks"}
            onClick={() => setGroup("tasks")}
            label="Tasks"
            count={standalone.length}
          />
          <GroupTab
            active={group === "campaign"}
            onClick={() => setGroup("campaign")}
            label="Campaign"
            count={campaigns.length}
          />
        </div>

        {group === "tasks" ? (
          <TaskCreateDialog workflowId={workflowId} folders={folders} />
        ) : (
          <CampaignCreateDialog workflowId={workflowId} />
        )}
      </div>

      {group === "tasks" ? (
        standalone.length === 0 ? (
          <EmptyState
            icon={<Rocket className="size-6" />}
            title="No standalone tasks"
            description="A task tells Claude what to make and which asset folder to use. Campaign posts live under the Campaign group."
            action={
              <TaskCreateDialog
                workflowId={workflowId}
                folders={folders}
                variant="secondary"
              />
            }
          />
        ) : visibleStandalone.length === 0 ? (
          <NoMatches />
        ) : (
          <div className="flex flex-col gap-2">
            {visibleStandalone.map((t) => (
              <TaskRow key={t.id} task={t} deletable />
            ))}
          </div>
        )
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="size-6" />}
          title="No campaigns yet"
          description="Plan a multi-day content calendar from a brief. The AI drafts the posts and tells you which photos to upload."
          action={<CampaignCreateDialog workflowId={workflowId} variant="secondary" />}
        />
      ) : campaignGroups.length === 0 ? (
        <NoMatches />
      ) : (
        <div className="flex flex-col gap-2">
          {campaignGroups.map((g) => (
            <CampaignAccordion
              key={g.campaign.id}
              campaign={g.campaign}
              tasks={g.tasks}
              defaultOpen={Boolean(q)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-secondary text-secondary-fg shadow-hard-sm"
          : "text-fg-muted hover:text-fg",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] tabular-nums",
          active
            ? "bg-secondary-fg/20 text-secondary-fg"
            : "bg-fg-muted/15 text-fg-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function CampaignAccordion({
  campaign,
  tasks,
  defaultOpen,
}: {
  campaign: CampaignLite;
  tasks: TaskLite[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  // Reflect search-driven default-open changes without stomping manual toggles
  // for the same query pass.
  React.useEffect(() => setOpen(defaultOpen), [defaultOpen]);

  return (
    <div className="overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-surface shadow-hard-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-2"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-fg-muted transition-transform duration-200 ease-out",
              open && "rotate-90",
            )}
          />
          <div className="min-w-0">
            <p className="truncate font-display font-semibold">{campaign.name}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 font-mono text-xs text-fg-muted">
              <span className="inline-flex items-center gap-1">
                <ListChecks className="size-3.5" />
                {campaign.items} item{campaign.items === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Rocket className="size-3.5" />
                {tasks.length} task{tasks.length === 1 ? "" : "s"}
              </span>
              {campaign.durationDays ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {campaign.durationDays}d · {campaign.slotsPerDay ?? 1}/day
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CampaignStatusBadge status={campaign.status} />
          <Link
            href={`/campaigns/${campaign.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs text-fg-muted underline underline-offset-2 hover:text-fg"
          >
            Open
          </Link>
        </div>
      </button>

      {/* Collapsible body: animate rows, not height, and keep it interruptible. */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col divide-y-2 divide-border-soft border-t-2 border-border">
            {tasks.length === 0 ? (
              <p className="px-4 py-4 font-mono text-xs text-fg-muted">
                No tasks yet. Approve the calendar to materialize its posts.
              </p>
            ) : (
              tasks.map((t) => <TaskRow key={t.id} task={t} bare />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  deletable = false,
  bare = false,
}: {
  task: TaskLite;
  deletable?: boolean;
  bare?: boolean;
}) {
  const meta = (
    <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs text-fg-muted">
      {task.dayIndex != null ? (
        <span className="inline-flex items-center gap-1">
          <CalendarRange className="size-3.5" />D{task.dayIndex} · S
          {(task.slotIndex ?? 0) + 1}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <FolderOpen className="size-3.5" />
        {task.folderName ?? "no folder"}
      </span>
      <span className="inline-flex items-center gap-1">
        <Cpu className="size-3.5" />
        {task.model}
      </span>
      <span>{task.runs} runs</span>
    </div>
  );

  const body = (
    <>
      <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1">
        <p className="truncate font-display font-semibold hover:underline">
          {task.name}
        </p>
        {meta}
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <ActionButton
          action={triggerRun.bind(null, task.id)}
          variant="primary"
          size="sm"
        >
          <Play className="size-4" /> Run
        </ActionButton>
        {deletable ? (
          <ActionButton
            action={deleteTask.bind(null, task.id)}
            confirm={`Delete task "${task.name}"?`}
            variant="ghost"
            size="icon"
          >
            <Trash2 className="size-4" />
          </ActionButton>
        ) : (
          <Link
            href={`/tasks/${task.id}`}
            className="font-mono text-xs text-fg-muted underline underline-offset-2 hover:text-fg"
          >
            Open
          </Link>
        )}
      </div>
    </>
  );

  if (bare) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {body}
      </div>
    );
  }
  return (
    <Card className="flex items-center justify-between gap-3 p-4">{body}</Card>
  );
}

function NoMatches() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft py-12 text-center">
      <Badge tone="muted">no matches</Badge>
      <p className="font-mono text-xs text-fg-muted">
        Nothing matches your search. Try a different term.
      </p>
    </div>
  );
}
