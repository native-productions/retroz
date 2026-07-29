"use client";

import * as React from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, FolderPlus, Images, Layers, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { WorkProjectDialog } from "@/components/work/work-project-dialog";
import type { WorkProject } from "@/lib/work-types";

const ACCENT_TILE: Record<WorkProject["accent"], string> = {
  primary: "bg-primary text-primary-fg",
  secondary: "bg-secondary text-secondary-fg",
  accent: "bg-accent text-accent-fg",
};

export type WorkTab = "chat" | "gallery" | "bundles";

/** Where a tab lives for a given project. Chat needs a session to land on. */
export function tabHref(
  tab: WorkTab,
  projectId: string,
  chatSessionId: string | null,
): string {
  if (tab === "chat") return chatSessionId ? `/work/${chatSessionId}` : "/work";
  return `/work/p/${projectId}/${tab}`;
}

/**
 * Work's chrome bar. Chat is scoped to one session but Gallery and Bundles are
 * scoped to the whole project, so the switch between them sits above the
 * session header rather than inside it, where it would read as session-local.
 *
 * The tabs are links, not a tab widget: each is a route. Nothing animates on
 * the transition — a moving indicator during a navigation reads as lag.
 */
export function WorkProjectBar({
  projects,
  activeProjectId,
  chatSessionId,
  tab,
  workflows,
}: {
  projects: WorkProject[];
  activeProjectId: string | null;
  /** The session the Chat tab opens — the one on screen, or the project's newest. */
  chatSessionId?: string | null;
  tab: WorkTab;
  workflows: { id: string; name: string }[];
}) {
  const [dialog, setDialog] = React.useState(false);
  const active = projects.find((p) => p.id === activeProjectId) ?? null;
  const chatTarget = chatSessionId ?? active?.chatSessionId ?? null;

  const tabs: { key: WorkTab; label: string; icon: typeof Images; count?: number }[] = [
    { key: "chat", label: "Chat", icon: MessagesSquare },
    { key: "gallery", label: "Gallery", icon: Images, count: active?.renderCount },
    { key: "bundles", label: "Bundles", icon: Layers, count: active?.bundleCount },
  ];

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b-2 border-border bg-surface px-3">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={projects.length === 0}>
          <button
            type="button"
            aria-label="Switch project"
            className="flex min-w-0 items-center gap-2 rounded-[var(--radius-retro)] border-2 border-transparent px-1.5 py-1 outline-none transition-colors hover:border-border-soft hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-border-soft data-[state=open]:bg-surface-2 disabled:pointer-events-none"
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-[3px] border-2 border-border font-mono text-[10px] font-bold",
                active ? ACCENT_TILE[active.accent] : "bg-surface-2 text-fg-muted",
              )}
            >
              {active?.code ?? "··"}
            </span>
            <span className="min-w-0 truncate font-display text-sm font-bold">
              {active?.name ?? "Work"}
            </span>
            {projects.length > 0 ? (
              <ChevronDown className="size-3.5 shrink-0 text-fg-muted" />
            ) : null}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="retro-card z-50 min-w-[14rem] p-1 shadow-hard-lg"
          >
            <DropdownMenu.Label className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted/70">
              Projects
            </DropdownMenu.Label>
            {projects.map((project) => (
              <DropdownMenu.Item key={project.id} asChild>
                <Link
                  href={tabHref(tab, project.id, project.chatSessionId)}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-fg",
                    project.id === activeProjectId
                      ? "font-semibold text-fg"
                      : "text-fg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-[3px] border-2 border-border font-mono text-[9px] font-bold",
                      ACCENT_TILE[project.accent],
                    )}
                  >
                    {project.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {project.id === activeProjectId ? (
                    <Check className="size-3.5 shrink-0" strokeWidth={3} />
                  ) : null}
                </Link>
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="my-1 h-0.5 bg-border-soft" />
            <DropdownMenu.Item
              onSelect={() => setDialog(true)}
              className="flex cursor-pointer select-none items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-sm text-fg-muted outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-fg"
            >
              <FolderPlus className="size-4 shrink-0" />
              New project
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {active ? (
        <nav
          aria-label="Project views"
          className="inline-flex items-center gap-1 rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 p-1"
        >
          {tabs.map((entry) => {
            const current = entry.key === tab;
            return (
              <Link
                key={entry.key}
                href={tabHref(entry.key, active.id, chatTarget)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  current
                    ? "bg-secondary text-secondary-fg shadow-hard-sm"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                <entry.icon className="size-3.5" />
                {entry.label}
                {entry.count === undefined || entry.count === 0 ? null : (
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      current ? "text-secondary-fg/70" : "text-fg-muted/70",
                    )}
                  >
                    {entry.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <WorkProjectDialog
        workflows={workflows}
        open={dialog}
        onOpenChange={setDialog}
      />
    </header>
  );
}
