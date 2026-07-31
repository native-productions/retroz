"use client";

import { AppWindow } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The browsing agent for the next message: a local Playwright browser that
 * opens the links in the message, reads them, and screenshots them.
 *
 * Separate from the Web picker beside it because the two share nothing — that
 * one is Tavily over HTTP and needs an API key, this one runs on the machine and
 * is the only source of page screenshots. Binary rather than a mode: there is no
 * useful middle setting between "open the links" and "do not".
 *
 * Styled as a chip rather than a bare toggle so it reads as one row of controls
 * with the pickers next to it; role="switch" keeps the semantics honest.
 *
 * Follows the same resting/active rule as the pickers: the default reads as the
 * resting state and only a deliberate change lights the chip up. On is the
 * default here, so it is Off that stands out — the same way the Web picker
 * leaves Auto quiet and lights up Always and Off.
 */
export function WorkBrowseToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const active = !value;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      title="Web Agent — opens and screenshots the links in your message"
      aria-label={`Web Agent: ${value ? "on" : "off"}`}
      onClick={() => onChange(!value)}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-[var(--radius-retro)] border-2 px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        active
          ? "border-border bg-surface-2 text-fg"
          : "border-transparent text-fg-muted hover:border-border hover:bg-surface-2 hover:text-fg",
      )}
    >
      <AppWindow className="size-4 shrink-0" />
      <span className="font-mono text-[11px] font-semibold">
        {value ? "On" : "Off"}
      </span>
    </button>
  );
}
