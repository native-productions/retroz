"use client";

import { createPortal } from "react-dom";
import { ImageOff, SearchX, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { WorkAttachment, WorkSkillOption } from "@/lib/work-types";

export interface MentionAnchor {
  /** Viewport coordinates of the caret the menu points at. */
  x: number;
  y: number;
}

/**
 * Caret-anchored picker for the composer's two triggers: `@` for pasted images
 * and `/` for skills. Opens above the caret so the composer text stays visible
 * while picking.
 */
export function WorkTriggerMenu({
  kind,
  images,
  skills,
  query,
  activeIndex,
  anchor,
  onPickImage,
  onPickSkill,
  onHoverIndex,
}: {
  kind: "image" | "skill";
  images: WorkAttachment[];
  skills: WorkSkillOption[];
  /** What has been typed after the trigger, for the header and empty state. */
  query: string;
  activeIndex: number;
  anchor: MentionAnchor;
  onPickImage: (item: WorkAttachment) => void;
  onPickSkill: (item: WorkSkillOption) => void;
  onHoverIndex: (index: number) => void;
}) {
  // Only ever rendered from a caret interaction, so the document is available.
  if (typeof document === "undefined") return null;

  const isSkill = kind === "skill";
  const width = isSkill ? 320 : 280;
  const left = Math.min(Math.max(anchor.x - 8, 16), window.innerWidth - width - 16);
  const count = isSkill ? skills.length : images.length;

  const heading = isSkill
    ? query
      ? `Skills matching “${query}”`
      : "Skills"
    : query
      ? `Images matching “${query}”`
      : "Images";

  return createPortal(
    <div
      role="listbox"
      aria-label={isSkill ? "Skills" : "Pasted images"}
      className="wk-pop retro-card fixed z-50 origin-bottom-left overflow-hidden p-1 shadow-hard-lg"
      style={{ left, width, bottom: window.innerHeight - anchor.y + 10 }}
    >
      <p className="truncate px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted/70">
        {heading}
      </p>

      {count === 0 ? (
        <EmptyRow isSkill={isSkill} query={query} />
      ) : (
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {isSkill
            ? skills.map((skill, i) => (
                <Row
                  key={skill.id}
                  active={i === activeIndex}
                  onHover={() => onHoverIndex(i)}
                  onPick={() => onPickSkill(skill)}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-[3px] border-2 border-border",
                      i === activeIndex
                        ? "bg-surface text-accent"
                        : "bg-surface-2 text-accent",
                    )}
                  >
                    <Sparkles className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs font-semibold">
                      <span className="text-accent">/</span>
                      {skill.slug}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-[11px] leading-tight",
                        i === activeIndex
                          ? "text-secondary-fg/80"
                          : "text-fg-muted/70",
                      )}
                    >
                      {skill.description || skill.name}
                    </span>
                  </span>
                  {skill.assigned ? null : (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[9px] uppercase tracking-wide",
                        i === activeIndex
                          ? "text-secondary-fg/70"
                          : "text-fg-muted/60",
                      )}
                    >
                      bank
                    </span>
                  )}
                </Row>
              ))
            : images.map((item, i) => (
                <Row
                  key={item.id}
                  active={i === activeIndex}
                  onHover={() => onHoverIndex(i)}
                  onPick={() => onPickImage(item)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt=""
                    className="size-8 shrink-0 rounded-[3px] border-2 border-border object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">
                    {item.name}
                  </span>
                  {item.origin === "session" ? null : (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[9px] uppercase tracking-wide",
                        i === activeIndex
                          ? "text-secondary-fg/70"
                          : "text-fg-muted/60",
                      )}
                    >
                      {item.origin === "global" ? "brand" : "bank"}
                    </span>
                  )}
                </Row>
              ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

function Row({
  active,
  onHover,
  onPick,
  children,
}: {
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      // Mousedown, not click: clicking must not blur the editor first.
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      className={cn(
        "flex items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left outline-none transition-colors",
        active ? "bg-secondary text-secondary-fg" : "text-fg-muted",
      )}
    >
      {children}
    </button>
  );
}

function EmptyRow({ isSkill, query }: { isSkill: boolean; query: string }) {
  const Icon = query ? SearchX : isSkill ? Sparkles : ImageOff;
  const message = query
    ? isSkill
      ? "No skill by that name."
      : "No image by that name."
    : isSkill
      ? "No skills yet. Add one in the Skills manager."
      : "Nothing to mention yet. Paste an image first.";

  return (
    <div className="flex items-center gap-2 px-2 py-3 text-xs text-fg-muted">
      <Icon className="size-4 shrink-0" />
      {message}
    </div>
  );
}
