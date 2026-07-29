"use client";

import * as React from "react";
import {
  FolderPlus,
  LoaderCircle,
  PanelLeftClose,
  Plus,
  Search,
  SquarePen,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/confirm-provider";
import type { WorkProject, WorkSession } from "@/lib/work-types";

const ACCENT_TILE: Record<WorkProject["accent"], string> = {
  primary: "bg-primary text-primary-fg",
  secondary: "bg-secondary text-secondary-fg",
  accent: "bg-accent text-accent-fg",
};

const BUCKETS = ["Today", "Yesterday", "Earlier"] as const;

/**
 * The Work page's own sidebar: projects on top, that project's sessions below.
 * It sits beside the app sidebar, so it stays a shade deeper to read as a
 * nested layer rather than a second copy of the main navigation.
 */
export function WorkRail({
  projects,
  sessions,
  activeProjectId,
  activeSessionId,
  busy,
  onSelectProject,
  onSelectSession,
  onNewSession,
  onNewProject,
  onDeleteProject,
  onDeleteSession,
  onCollapse,
}: {
  projects: WorkProject[];
  sessions: WorkSession[];
  activeProjectId: string | null;
  activeSessionId: string | null;
  busy: boolean;
  onSelectProject: (id: string) => void;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onCollapse: () => void;
}) {
  const confirm = useConfirm();
  const [query, setQuery] = React.useState("");

  async function confirmDeleteProject(project: WorkProject) {
    const ok = await confirm({
      title: `Delete "${project.name}"?`,
      description:
        "Its sessions, conversations, and rendered images are removed for good.",
      confirmLabel: "Delete project",
      tone: "danger",
    });
    if (ok) onDeleteProject(project.id);
  }

  async function confirmDeleteSession(session: WorkSession) {
    const ok = await confirm({
      title: `Delete "${session.title}"?`,
      description:
        "The conversation and everything it rendered are removed for good.",
      confirmLabel: "Delete session",
      tone: "danger",
    });
    if (ok) onDeleteSession(session.id);
  }

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter(
      (s) =>
        s.projectId === activeProjectId &&
        (!q || s.title.toLowerCase().includes(q)),
    );
  }, [sessions, activeProjectId, query]);

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r-2 border-border bg-surface-2/50">
      <div className="flex items-center justify-between gap-2 border-b-2 border-border px-3 py-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold leading-none">Work</p>
          <p className="mt-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.08em] text-fg-muted">
            Playground
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onNewSession}
            disabled={busy}
            title="New session"
            aria-label="New session"
            className="grid size-8 place-items-center rounded-[var(--radius-retro)] border-2 border-border bg-primary text-primary-fg shadow-hard-sm retro-press outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <SquarePen className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onCollapse}
            title="Hide sessions"
            aria-label="Hide sessions"
            className="grid size-7 place-items-center rounded-[var(--radius-retro)] text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
      </div>

      <section className="border-b-2 border-border-soft px-2.5 py-3">
        <SectionLabel
          label="Projects"
          action={
            <button
              type="button"
              onClick={onNewProject}
              title="New project"
              aria-label="New project"
              className="grid size-5 place-items-center rounded-[3px] text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-90"
            >
              <FolderPlus className="size-3.5" />
            </button>
          }
        />
        <div className="mt-1.5 flex flex-col gap-1">
          {projects.length === 0 ? (
            <button
              type="button"
              onClick={onNewProject}
              className="flex items-center gap-2 rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft px-2.5 py-2 text-xs text-fg-muted outline-none transition-colors hover:border-border hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              <FolderPlus className="size-3.5" />
              Create your first project
            </button>
          ) : null}
          {projects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <div
                key={project.id}
                className={cn(
                  "group flex items-center gap-1 rounded-[var(--radius-retro)] border-2 pr-1 transition-colors",
                  active
                    ? "border-border bg-surface shadow-hard-sm"
                    : "border-transparent hover:bg-surface-2",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectProject(project.id)}
                  aria-current={active ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-[3px] border-2 border-border font-mono text-[10px] font-bold",
                      ACCENT_TILE[project.accent],
                    )}
                  >
                    {project.code}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px]",
                      active ? "font-semibold text-fg" : "text-fg-muted",
                    )}
                  >
                    {project.name}
                  </span>
                </button>
                <span className="shrink-0 font-mono text-[10px] text-fg-muted group-hover:hidden">
                  {project.sessionCount}
                </span>
                <button
                  type="button"
                  onClick={() => confirmDeleteProject(project)}
                  aria-label={`Delete ${project.name}`}
                  title="Delete project"
                  className="hidden shrink-0 place-items-center rounded-[3px] p-0.5 text-fg-muted outline-none transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-ring active:scale-90 group-hover:grid"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <div className="px-2.5 pt-3">
        <SectionLabel label="Sessions" />
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sessions"
            aria-label="Filter sessions"
            className="h-8 w-full rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface pl-7 pr-2 text-xs outline-none transition-colors placeholder:text-fg-muted/60 focus-visible:border-ring"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-3 pt-2">
        {visible.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-fg-muted">
            {query ? "No session matches that." : "No sessions in this project yet."}
          </p>
        ) : (
          BUCKETS.map((bucket) => {
            const rows = visible.filter((s) => s.bucket === bucket);
            if (rows.length === 0) return null;
            return (
              <div key={bucket} className="mb-3 last:mb-0">
                <p className="px-1 pb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-fg-muted/60">
                  {bucket}
                </p>
                <div className="flex flex-col gap-1">
                  {rows.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      active={session.id === activeSessionId}
                      onSelect={() => onSelectSession(session.id)}
                      onDelete={() => confirmDeleteSession(session)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </nav>

      <div className="border-t-2 border-border-soft px-3 py-2.5">
        <button
          type="button"
          onClick={onNewSession}
          className="flex w-full items-center gap-2 rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft px-2.5 py-1.5 text-xs text-fg-muted outline-none transition-colors hover:border-border hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
        >
          <Plus className="size-3.5" />
          New session
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({
  label,
  action,
}: {
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
        {label}
      </p>
      {action}
    </div>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: WorkSession;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center rounded-[var(--radius-retro)] border-2 transition-colors",
        active
          ? "border-border bg-secondary text-secondary-fg shadow-hard-sm"
          : "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-[4px] px-2.5 py-1.5 pr-7 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex w-full items-center gap-1.5">
          {session.status === "running" ? (
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
          ) : session.status === "error" ? (
            <span className="size-2 shrink-0 rounded-full bg-danger" />
          ) : null}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              active && "font-semibold",
            )}
          >
            {session.title}
          </span>
        </span>
        <span
          className={cn(
            "font-mono text-[10px]",
            active ? "text-secondary-fg/70" : "text-fg-muted/70",
          )}
        >
          {session.updatedLabel}
        </span>
      </button>

      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${session.title}`}
        title="Delete session"
        className={cn(
          "absolute right-1.5 top-1.5 hidden place-items-center rounded-[3px] p-0.5 outline-none transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-ring active:scale-90 group-hover:grid",
          active ? "text-secondary-fg/70" : "text-fg-muted",
        )}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
