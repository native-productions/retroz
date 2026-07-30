"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Globe } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  RESEARCH_MODES,
  RESEARCH_LABELS,
  RESEARCH_HINTS,
  type ResearchMode,
} from "@/lib/research";

/**
 * Web research for the next message. It sits in the composer rather than the
 * session header because whether a request needs checking is a property of that
 * request — one turn asks for a restyle, the next asks for this year's numbers.
 */
export function WorkResearchPicker({
  value,
  onChange,
}: {
  value: ResearchMode;
  onChange: (mode: ResearchMode) => void;
}) {
  // Auto is the default, so it reads as the resting state; on and off are both
  // deliberate choices and light the chip up.
  const active = value !== "AUTO";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="Web research"
          aria-label={`Web research: ${RESEARCH_LABELS[value].toLowerCase()}`}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-[var(--radius-retro)] border-2 px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
            active
              ? "border-border bg-surface-2 text-fg"
              : "border-transparent text-fg-muted hover:border-border hover:bg-surface-2 hover:text-fg",
            "data-[state=open]:border-border data-[state=open]:bg-surface-2",
          )}
        >
          <Globe className="size-4 shrink-0" />
          <span className="font-mono text-[11px] font-semibold">
            {RESEARCH_LABELS[value]}
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="top"
          sideOffset={8}
          className="retro-card z-50 min-w-[15rem] p-1 shadow-hard-lg"
        >
          <DropdownMenu.Label className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted/70">
            Web research
          </DropdownMenu.Label>

          {RESEARCH_MODES.map((mode) => (
            <DropdownMenu.Item
              key={mode}
              onSelect={() => onChange(mode)}
              className={cn(
                "flex cursor-pointer select-none items-start gap-2.5 rounded-[4px] px-2 py-1.5 outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-fg",
                mode === value ? "text-fg" : "text-fg-muted",
              )}
            >
              <span
                className={cn(
                  "w-12 shrink-0 font-mono text-xs",
                  mode === value && "font-semibold",
                )}
              >
                {RESEARCH_LABELS[mode]}
              </span>
              <span className="min-w-0 flex-1 font-mono text-[10px] leading-snug opacity-70">
                {RESEARCH_HINTS[mode]}
              </span>
              {mode === value ? (
                <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={3} />
              ) : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
