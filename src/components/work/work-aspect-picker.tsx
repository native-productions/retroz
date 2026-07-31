"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Frame } from "lucide-react";
import { cn } from "@/lib/cn";
import { ASPECT_RATIOS, findAspectRatio } from "@/lib/aspect-ratios";

/**
 * Locks every render in this session to one shape — a carousel is only usable
 * when its slides agree, and the bundle editor can only flag the mismatch after
 * the fact. It sits in the session header with the model because both are
 * session-scoped settings that persist the moment they change, unlike the
 * per-message controls in the composer.
 */
export function WorkAspectPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const active = findAspectRatio(value);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="Render shape"
          aria-label={`Render shape: ${active ? active.label : "auto"}`}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-[var(--radius-retro)] border-2 px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
            active
              ? "border-border bg-surface-2 text-fg"
              : "border-transparent text-fg-muted hover:border-border hover:bg-surface-2 hover:text-fg",
            "data-[state=open]:border-border data-[state=open]:bg-surface-2",
          )}
        >
          <Frame className="size-4 shrink-0" />
          <span className="font-mono text-[11px] font-semibold">
            {active ? active.label : "Auto"}
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          side="bottom"
          sideOffset={8}
          className="retro-card z-50 min-w-[13rem] p-1 shadow-hard-lg"
        >
          <DropdownMenu.Label className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted/70">
            Render shape
          </DropdownMenu.Label>

          <RatioRow
            label="Auto"
            hint="Agent picks per image"
            selected={!active}
            onSelect={() => onChange(null)}
          />
          <DropdownMenu.Separator className="my-1 h-0.5 bg-border-soft" />
          {ASPECT_RATIOS.map((ratio) => (
            <RatioRow
              key={ratio.id}
              label={ratio.label}
              hint={`${ratio.hint} · ${ratio.width}×${ratio.height}`}
              selected={active?.id === ratio.id}
              onSelect={() => onChange(ratio.id)}
            />
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RatioRow({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-[4px] px-2 py-1.5 outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-fg",
        selected ? "text-fg" : "text-fg-muted",
      )}
    >
      <span
        className={cn(
          "w-11 shrink-0 font-mono text-xs",
          selected && "font-semibold",
        )}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] opacity-70">
        {hint}
      </span>
      {selected ? (
        <Check className="size-3.5 shrink-0" strokeWidth={3} />
      ) : null}
    </DropdownMenu.Item>
  );
}
