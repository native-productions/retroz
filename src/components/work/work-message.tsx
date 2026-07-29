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

/** Splits on `@name` tokens so known mentions can render as image chips. */
function renderWithMentions(text: string, mentions: WorkMention[]) {
  if (mentions.length === 0) return text;
  const parts = text.split(/(@[\p{L}\d._-]+)/u);
  return parts.map((part, i) => {
    if (!part.startsWith("@")) return <React.Fragment key={i}>{part}</React.Fragment>;
    const found = mentions.find((m) => `@${m.name}` === part);
    if (!found) return <React.Fragment key={i}>{part}</React.Fragment>;
    return (
      <span
        key={i}
        className="mx-[1px] inline-flex max-w-[15rem] translate-y-[3px] items-center gap-1.5 rounded-[4px] border-2 border-border bg-surface-2 py-[1px] pl-[2px] pr-1.5 font-mono text-[11px] font-semibold leading-[18px] text-fg"
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
  });
}

export function WorkMessageRow({ message }: { message: WorkMessage }) {
  if (message.role === "user") return <UserMessage message={message} />;
  if (message.role === "tool") return <ToolMessage message={message} />;
  return <AssistantMessage message={message} />;
}

function UserMessage({ message }: { message: WorkUserMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%]">
        <div className="rounded-[var(--radius-retro)] border-2 border-border bg-surface px-3.5 py-2.5 text-sm leading-6 shadow-hard-sm">
          <p className="whitespace-pre-wrap break-words">
            {renderWithMentions(message.text, message.mentions ?? [])}
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
