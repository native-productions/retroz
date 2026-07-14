"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Controlled tag editor — chips with remove buttons plus a free-text input that
 * commits a tag on Enter or comma. Tags are normalized to lowercase, hyphenated,
 * and de-duplicated. Purely presentational; persistence is the caller's job.
 */
export function AssetTagsInput({
  value,
  onChange,
  disabled,
  placeholder = "Add tag…",
  className,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const tags = value ?? [];

  function commit(raw: string) {
    const tag = raw.toLowerCase().replace(/^#/, "").trim().replace(/\s+/g, "-");
    if (!tag) return;
    if (!tags.includes(tag)) onChange([...tags, tag]);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-[var(--radius-retro)] border-2 border-border bg-surface p-1.5",
        disabled && "opacity-60",
        className,
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full border-2 border-border-soft bg-surface-2 px-2 py-0.5 text-[10px] font-mono text-fg"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(tag)}
              title={`Remove ${tag}`}
              className="grid place-items-center text-fg-muted hover:text-danger"
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && tags.length > 0) {
              remove(tags[tags.length - 1]);
            }
          }}
          onBlur={() => draft && commit(draft)}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-16 flex-1 bg-transparent px-1 text-[11px] font-mono outline-none placeholder:text-fg-muted"
        />
      )}
    </div>
  );
}
