"use client";

import * as React from "react";
import { CircleCheck, LoaderCircle, TriangleAlert, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import { Markdown } from "@/components/markdown";
import type {
  WorkAssistantMessage,
  WorkMention,
  WorkMessage,
  WorkToolMessage,
  WorkUserMessage,
} from "@/lib/work-types";

const CHIP_CLASS =
  "mx-[1px] inline-flex max-w-[15rem] translate-y-[3px] items-center rounded-[4px] border-2 border-border bg-surface-2 py-[1px] pr-1.5 font-mono text-[11px] font-semibold leading-[18px] text-fg";

/** Both composer triggers, matched the way the executor reads them back. */
const TOKEN_RE = /(@[\p{L}\d._-]+)|(\/[a-z0-9][a-z0-9._-]*)/giu;

/**
 * Renders `@image` and `/skill` the way the composer showed them: a mention
 * keeps its thumbnail, a skill keeps its coloured slash. A token only counts at
 * a word boundary, so a path or an email never becomes a chip, and an unknown
 * `/slug` stays plain text because the run would not have loaded it either.
 */
function renderTokens(
  text: string,
  mentions: WorkMention[],
  skillSlugs: string[],
) {
  const known = new Set(skillSlugs.map((s) => s.toLowerCase()));
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TOKEN_RE)) {
    const at = match.index ?? 0;
    if (at > 0 && !/\s/.test(text[at - 1])) continue;

    const token = match[0];
    const chip = match[1]
      ? mentionChip(token.slice(1), mentions, at)
      : known.has(token.slice(1).toLowerCase())
        ? skillChip(token.slice(1), at)
        : null;
    if (!chip) continue;

    if (at > cursor) nodes.push(text.slice(cursor, at));
    nodes.push(chip);
    cursor = at + token.length;
  }

  if (nodes.length === 0) return text;
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/** A typed `@name` with no matching asset still reads as a handle, not prose. */
function mentionChip(name: string, mentions: WorkMention[], key: number) {
  const found = mentions.find((m) => m.name === name);
  if (!found) {
    return (
      <span
        key={key}
        className="rounded-[3px] border border-border-soft bg-surface-2 px-1 font-mono text-[11px] font-semibold text-fg-muted"
      >
        @{name}
      </span>
    );
  }
  return (
    <span
      key={key}
      className={cn(
        CHIP_CLASS,
        "gap-1.5 pl-[2px]",
        // Matches the composer: an accented chip is a render being revised.
        found.kind === "render" && "border-accent",
      )}
    >
      {found.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={found.url}
          alt=""
          className="size-[18px] shrink-0 rounded-[2px] border border-border-soft object-cover"
        />
      ) : null}
      <span className="truncate">{found.name.replace(/\.[^.]+$/, "")}</span>
    </span>
  );
}

function skillChip(slug: string, key: number) {
  return (
    <span key={key} className={cn(CHIP_CLASS, "pl-1")}>
      <span className="text-accent">/</span>
      <span className="truncate">{slug}</span>
    </span>
  );
}

export function WorkMessageRow({
  message,
  skillSlugs = [],
}: {
  message: WorkMessage;
  /** Slugs a `/token` is allowed to render as a skill chip for. */
  skillSlugs?: string[];
}) {
  if (message.role === "user") {
    return <UserMessage message={message} skillSlugs={skillSlugs} />;
  }
  if (message.role === "tool") return <ToolMessage message={message} />;
  return <AssistantMessage message={message} />;
}

function UserMessage({
  message,
  skillSlugs,
}: {
  message: WorkUserMessage;
  skillSlugs: string[];
}) {
  // Anything already inline as a mention chip would only repeat in the strip.
  const mentioned = new Set((message.mentions ?? []).map((m) => m.assetId));
  const gallery = (message.attachments ?? []).filter(
    (a) => !mentioned.has(a.assetId),
  );

  return (
    <div className="flex justify-end">
      <div className="max-w-[80%]">
        <div className="overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-surface text-sm leading-6 shadow-hard-sm">
          {gallery.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-b-2 border-border-soft bg-surface-2/50 p-2">
              {gallery.map((att) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={att.assetId || att.relPath}
                  src={att.url}
                  alt={att.name}
                  title={att.name}
                  draggable={false}
                  className="size-16 rounded-[4px] border-2 border-border object-cover"
                />
              ))}
            </div>
          ) : null}
          <p className="whitespace-pre-wrap break-words px-3.5 py-2.5">
            {renderTokens(message.text, message.mentions ?? [], skillSlugs)}
          </p>
        </div>
        <p className="mt-1 text-right font-mono text-[10px] text-fg-muted/70">
          {message.timeLabel}
        </p>
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: WorkAssistantMessage }) {
  return (
    <div className="flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/retroz-mark.png"
        alt=""
        draggable={false}
        className="mt-0.5 size-6 shrink-0 select-none object-contain"
      />
      <div className="min-w-0 flex-1">
        <Markdown className="leading-6">{message.text}</Markdown>
        <p className="mt-1 font-mono text-[10px] text-fg-muted/70">
          {message.timeLabel}
        </p>
      </div>
    </div>
  );
}

function ToolMessage({ message }: { message: WorkToolMessage }) {
  const Icon =
    message.status === "running"
      ? LoaderCircle
      : message.status === "error"
        ? TriangleAlert
        : CircleCheck;

  return (
    <div className="ml-9 flex items-center gap-2.5 rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface-2/60 px-2.5 py-1.5">
      <Wrench className="size-3.5 shrink-0 text-fg-muted" />
      <span className="shrink-0 font-mono text-[11px] font-semibold text-fg">
        {message.tool}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
        {message.detail}
      </span>
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          message.status === "running" && "animate-spin text-fg-muted",
          message.status === "done" && "text-primary",
          message.status === "error" && "text-danger",
        )}
      />
    </div>
  );
}
