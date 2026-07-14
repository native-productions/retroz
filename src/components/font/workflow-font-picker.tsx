"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { setWorkflowFont } from "@/lib/actions/font-actions";

interface PickFont {
  id: string;
  family: string;
  category: string;
}

export function WorkflowFontPicker({
  workflowId,
  fonts,
  assignedIds,
}: {
  workflowId: string;
  fonts: PickFont[];
  assignedIds: string[];
}) {
  const router = useRouter();
  const [assigned, setAssigned] = React.useState(new Set(assignedIds));
  const [pending, start] = React.useTransition();

  function toggle(fontId: string) {
    const next = new Set(assigned);
    const isAssigned = next.has(fontId);
    if (isAssigned) next.delete(fontId);
    else next.add(fontId);
    setAssigned(next);
    start(async () => {
      await setWorkflowFont({ workflowId, fontId, assigned: !isAssigned });
      router.refresh();
    });
  }

  const noneAssigned = assigned.size === 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        {noneAssigned
          ? "No fonts assigned — the AI can use the whole Font Bank."
          : `${assigned.size} font${assigned.size === 1 ? "" : "s"} assigned — the AI is limited to these.`}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fonts.map((f) => {
          const on = assigned.has(f.id);
          return (
            <button
              key={f.id}
              onClick={() => toggle(f.id)}
              disabled={pending}
              className={cn(
                "retro-card flex items-center justify-between gap-2 p-4 text-left retro-press",
                on ? "ring-2 ring-primary" : "opacity-80",
              )}
            >
              <div className="min-w-0">
                <p
                  className="truncate text-xl"
                  style={{ fontFamily: `'${f.family}'` }}
                >
                  {f.family}
                </p>
                <p className="text-[10px] text-fg-muted font-mono">
                  {f.category.toLowerCase()}
                </p>
              </div>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-2 border-border",
                  on ? "bg-primary text-primary-fg" : "bg-surface-2",
                )}
              >
                {on ? <Check className="size-3.5" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
