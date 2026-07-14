"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { setWorkflowSkill } from "@/lib/actions/skill-actions";

interface PickSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export function WorkflowSkillPicker({
  workflowId,
  skills,
  assignedIds,
}: {
  workflowId: string;
  skills: PickSkill[];
  assignedIds: string[];
}) {
  const router = useRouter();
  const [assigned, setAssigned] = React.useState(new Set(assignedIds));
  const [pending, start] = React.useTransition();

  function toggle(skillId: string) {
    const next = new Set(assigned);
    const isAssigned = next.has(skillId);
    if (isAssigned) next.delete(skillId);
    else next.add(skillId);
    setAssigned(next);
    start(async () => {
      await setWorkflowSkill({ workflowId, skillId, assigned: !isAssigned });
      router.refresh();
    });
  }

  const noneAssigned = assigned.size === 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        {noneAssigned
          ? "No skills assigned — the AI can use every enabled skill."
          : `${assigned.size} skill${assigned.size === 1 ? "" : "s"} assigned — the AI is limited to these.`}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {skills.map((s) => {
          const on = assigned.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              disabled={pending}
              className={cn(
                "retro-card flex items-start justify-between gap-3 p-4 text-left retro-press",
                on ? "ring-2 ring-primary" : "opacity-80",
              )}
            >
              <div className="min-w-0">
                <p className="font-display font-semibold truncate">{s.name}</p>
                <p className="text-[10px] text-fg-muted font-mono">/{s.slug}</p>
                <p className="mt-1 text-sm text-fg-muted line-clamp-2">
                  {s.description || "No description."}
                </p>
              </div>
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 border-border",
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
