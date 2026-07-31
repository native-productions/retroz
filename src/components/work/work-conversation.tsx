"use client";

import * as React from "react";
import { FolderPlus, PanelLeftOpen, PanelRightOpen, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/ui-button";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/ui-select";
import { ModelSelectOptions } from "@/components/model-select-options";
import { WorkMessageRow } from "@/components/work/work-message";
import {
  WorkComposer,
  type WorkComposerHandle,
} from "@/components/work/work-composer";
import { WorkAspectPicker } from "@/components/work/work-aspect-picker";
import type { ResearchMode } from "@/lib/research";
import type {
  WorkAttachment,
  WorkMention,
  WorkMessage,
  WorkSkillOption,
} from "@/lib/work-types";

const SUGGESTIONS = [
  "Buat carousel 3 slide soal kebiasaan pagi.",
  "Bikin quote card gelap dengan tipografi besar.",
  "Susun cover reels, judul pendek, tone tenang.",
];

/**
 * Middle column: session header, the message stream, and the composer.
 * The stream is the only scrolling region so the composer never drifts.
 */
export function WorkConversation({
  sessionId,
  title,
  projectName,
  hasProjects,
  messages,
  skillSlugs,
  model,
  onModelChange,
  attachments,
  uploading,
  onAttach,
  onRemoveAttachment,
  onSearchMentions,
  onSearchSkills,
  onSubmit,
  onStop,
  busy,
  aspectRatio,
  onAspectRatioChange,
  researchMode,
  onResearchModeChange,
  searchAvailable,
  browseWeb,
  onBrowseWebChange,
  railHidden,
  canvasHidden,
  onShowRail,
  onShowCanvas,
  onNewProject,
  onNewSession,
}: {
  sessionId: string | null;
  title: string | null;
  projectName: string;
  hasProjects: boolean;
  messages: WorkMessage[];
  /** Slugs a `/token` in a sent message renders as a skill chip for. */
  skillSlugs: string[];
  model: string;
  onModelChange: (model: string) => void;
  attachments: WorkAttachment[];
  uploading: boolean;
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onSearchMentions: (query: string) => Promise<WorkAttachment[]>;
  onSearchSkills: (query: string) => Promise<WorkSkillOption[]>;
  onSubmit: (
    text: string,
    mentions: WorkMention[],
    researchMode: ResearchMode,
    browseWeb: boolean,
  ) => void;
  onStop: () => void;
  busy: boolean;
  aspectRatio: string | null;
  onAspectRatioChange: (id: string | null) => void;
  researchMode: ResearchMode;
  onResearchModeChange: (mode: ResearchMode) => void;
  searchAvailable: boolean;
  browseWeb: boolean;
  onBrowseWebChange: (next: boolean) => void;
  railHidden: boolean;
  canvasHidden: boolean;
  onShowRail: () => void;
  onShowCanvas: () => void;
  onNewProject: () => void;
  onNewSession: () => void;
}) {
  const composerRef = React.useRef<WorkComposerHandle>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b-2 border-border px-6 py-3">
        {railHidden ? (
          <button
            type="button"
            onClick={onShowRail}
            title="Show sessions"
            aria-label="Show sessions"
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-retro)] text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-bold leading-tight">
            {title ?? "Work"}
          </h1>
          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted">
            {projectName}
            {busy ? " · running" : ""}
          </p>
        </div>

        {/* Session-scoped settings live together here: both persist the moment
            they change, unlike the per-message controls in the composer. */}
        {sessionId ? (
          <>
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger
                aria-label="Model"
                className="h-8 w-auto min-w-[7.5rem] font-mono text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <ModelSelectOptions />
              </SelectContent>
            </Select>
            <WorkAspectPicker
              value={aspectRatio}
              onChange={onAspectRatioChange}
            />
          </>
        ) : null}

        {canvasHidden && sessionId ? (
          <button
            type="button"
            onClick={onShowCanvas}
            title="Show canvas"
            aria-label="Show canvas"
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-retro)] text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto flex w-full max-w-[44rem] flex-col gap-5 px-6 py-6",
            messages.length === 0 && "h-full justify-center py-0",
          )}
        >
          {!sessionId ? (
            <NoSession
              hasProjects={hasProjects}
              onNewProject={onNewProject}
              onNewSession={onNewSession}
            />
          ) : messages.length === 0 ? (
            <SessionIntro
              onPick={(text) => {
                composerRef.current?.insertText(text);
                composerRef.current?.focus();
              }}
            />
          ) : (
            messages.map((message) => (
              <WorkMessageRow
                key={message.id}
                message={message}
                skillSlugs={skillSlugs}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {sessionId ? (
        <div className="mx-auto w-full max-w-[44rem]">
          <WorkComposer
            ref={composerRef}
            sessionId={sessionId}
            attachments={attachments}
            uploading={uploading}
            onAttach={onAttach}
            onRemoveAttachment={onRemoveAttachment}
            onSearchMentions={onSearchMentions}
            onSearchSkills={onSearchSkills}
            onSubmit={onSubmit}
            onStop={onStop}
            busy={busy}
            researchMode={researchMode}
            onResearchModeChange={onResearchModeChange}
            searchAvailable={searchAvailable}
            browseWeb={browseWeb}
            onBrowseWebChange={onBrowseWebChange}
          />
        </div>
      ) : null}
    </section>
  );
}

function NoSession({
  hasProjects,
  onNewProject,
  onNewSession,
}: {
  hasProjects: boolean;
  onNewProject: () => void;
  onNewSession: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/retroz-mark.png"
        alt=""
        draggable={false}
        className="size-12 select-none object-contain"
      />
      <h2 className="mt-4 font-display text-xl font-bold tracking-tight">
        {hasProjects ? "Pick a session to continue" : "Start your first project"}
      </h2>
      <p className="mt-2 max-w-[30rem] text-sm leading-relaxed text-fg-muted">
        {hasProjects
          ? "Sessions live in the rail on the left. Open one, or start a new thread."
          : "A project groups related sessions and borrows a workflow's brand voice, fonts, and assets."}
      </p>
      <div className="mt-6">
        {hasProjects ? (
          <Button size="sm" onClick={onNewSession}>
            <Plus className="size-4" />
            New session
          </Button>
        ) : (
          <Button size="sm" onClick={onNewProject}>
            <FolderPlus className="size-4" />
            New project
          </Button>
        )}
      </div>
    </div>
  );
}

function SessionIntro({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/retroz-mark.png"
        alt=""
        draggable={false}
        className="size-12 select-none object-contain"
      />
      <h2 className="mt-4 font-display text-xl font-bold tracking-tight">
        Make something for the feed
      </h2>
      <p className="mt-2 max-w-[30rem] text-sm leading-relaxed text-fg-muted">
        Paste a photo with ⌘V, then point at it with{" "}
        <span className="rounded-[3px] border border-border-soft bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-fg">
          @image-1
        </span>{" "}
        while you describe the post. Retroz writes the HTML and renders the PNG.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="flex items-center gap-2 rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface px-2.5 py-1.5 text-left text-xs text-fg-muted outline-none transition-colors hover:border-border hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
          >
            <Sparkles className="size-3.5 shrink-0 text-accent" />
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
