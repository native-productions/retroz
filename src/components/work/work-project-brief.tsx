"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Save } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import { updateWorkProject } from "@/lib/actions/work-actions";

const PLACEHOLDER = `You are a senior researcher writing for people who are new to the topic.

## Style
Soft, warm, a little playful. Short sentences. No corporate voice, no hype.

## Language
Bahasa Indonesia for body copy, English for technical terms.

## Visual
Muted palette, generous whitespace, one idea per slide.`;

/**
 * The project's standing brief: role, voice, language, visual rules. It leads
 * the run prompt and outranks the channel instruction, so this is the highest-
 * leverage text in the whole app — the editor gives it room rather than burying
 * it in a dialog.
 */
export function WorkProjectBrief({
  projectId,
  name: initialName,
  instruction: initialInstruction,
  workflowName,
  channelInstruction,
}: {
  projectId: string;
  name: string;
  instruction: string;
  workflowName: string;
  channelInstruction: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [instruction, setInstruction] = React.useState(initialInstruction);
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  const dirty =
    name.trim() !== initialName || instruction !== initialInstruction;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || state === "saving") return;
    setState("saving");
    try {
      await updateWorkProject({ id: projectId, name: trimmed, instruction });
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("idle");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-5">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight">
            Project brief
          </h1>
          <p className="mt-1 max-w-[42rem] text-sm leading-relaxed text-fg-muted">
            The foundation for everything this project makes. It opens every run
            and is restated whenever you change it, so an edit lands on your next
            message rather than your next session. Where it disagrees with the
            channel instruction, this wins.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
            Project name
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
            Brief
          </span>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
            }}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            className="min-h-[26rem] w-full resize-y rounded-[var(--radius-retro)] border-2 border-border bg-surface px-3 py-2.5 font-mono text-[13px] leading-6 outline-none transition-colors placeholder:text-fg-muted/50 focus-visible:border-ring"
          />
          <span className="font-mono text-[10px] text-fg-muted/70">
            Markdown headings (## Style, ## Language) keep it readable for both
            of you · ⌘⏎ to save
          </span>
        </label>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!dirty || state === "saving"}>
            {state === "saving" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : state === "saved" ? (
              <Check className="size-4" />
            ) : (
              <Save className="size-4" />
            )}
            {state === "saved" ? "Saved" : "Save brief"}
          </Button>
          <span
            className={cn(
              "font-mono text-[10px] uppercase tracking-[0.08em]",
              dirty ? "text-accent" : "text-fg-muted/60",
            )}
          >
            {dirty ? "unsaved changes" : `${instruction.length} characters`}
          </span>
        </div>

        <section className="rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft bg-surface-2/30 p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
            Channel instruction · {workflowName}
          </h2>
          <p className="mt-1 text-xs text-fg-muted">
            Inherited by every project on this channel. Edit it on the workflow.
          </p>
          <pre className="mt-2.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-fg-muted/80">
            {channelInstruction || "(none)"}
          </pre>
        </section>
      </div>
    </div>
  );
}
