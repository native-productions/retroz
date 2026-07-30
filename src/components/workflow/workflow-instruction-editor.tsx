"use client";

import * as React from "react";
import { Save, Check, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { ActionButton } from "@/components/ui/ui-action-button";
import { Textarea } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import { ModelSelectOptions } from "@/components/model-select-options";
import {
  RESEARCH_MODES,
  RESEARCH_LABELS,
  RESEARCH_HINTS,
  RESEARCH_LOCKED_HINT,
  type ResearchMode,
} from "@/lib/research";
import { updateWorkflow, deleteWorkflow } from "@/lib/actions/workflow-actions";

export function WorkflowInstructionEditor({
  workflowId,
  workflowName,
  initialInstruction,
  initialModel,
  initialResearchMode,
  researchAvailable,
}: {
  workflowId: string;
  workflowName: string;
  initialInstruction: string;
  initialModel: string | null;
  initialResearchMode: ResearchMode;
  /** False when no Tavily key is saved — the picker locks. */
  researchAvailable: boolean;
}) {
  const [instruction, setInstruction] = React.useState(initialInstruction);
  const [model, setModel] = React.useState<string>(initialModel ?? "default");
  const [research, setResearch] = React.useState<ResearchMode>(
    initialResearchMode,
  );
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setState("saving");
    await updateWorkflow({
      id: workflowId,
      globalInstruction: instruction,
      defaultModel: model === "default" ? null : model,
      researchMode: research,
    });
    setState("saved");
    setTimeout(() => setState("idle"), 1600);
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Field
        label="Global instruction"
        hint="Shared context prepended to every task in this workflow — brand voice, layout rules, do/don'ts."
      >
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={
            "You are producing Instagram education carousels for Native Academy.\nStyle: bold retro, high contrast, one idea per slide.\nAlways include the @native.academy handle bottom-right."
          }
          className="min-h-56"
        />
      </Field>

      <Field
        label="Web research"
        hint={
          researchAvailable ? RESEARCH_HINTS[research] : RESEARCH_LOCKED_HINT
        }
        className="w-72"
      >
        <Select
          value={research}
          onValueChange={(v) => setResearch(v as ResearchMode)}
          disabled={!researchAvailable}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESEARCH_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {RESEARCH_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Default model" className="w-56">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Use app default</SelectItem>
              <ModelSelectOptions />
            </SelectContent>
          </Select>
        </Field>

        <Button onClick={save} disabled={state === "saving"}>
          {state === "saving" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : state === "saved" ? (
            <Check className="size-4" />
          ) : (
            <Save className="size-4" />
          )}
          {state === "saved" ? "Saved" : "Save"}
        </Button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 border-t-2 border-border pt-4">
        <div>
          <p className="font-display text-sm font-semibold">Danger zone</p>
          <p className="text-xs text-fg-muted">
            Deletes this workflow with all its folders, tasks, and runs.
          </p>
        </div>
        <ActionButton
          action={deleteWorkflow.bind(null, workflowId)}
          confirm={{
            title: "Delete workflow?",
            description: `“${workflowName}” and all its folders, tasks, and runs will be permanently deleted.`,
            confirmLabel: "Delete workflow",
          }}
          variant="danger"
        >
          <Trash2 className="size-4" /> Delete workflow
        </ActionButton>
      </div>
    </div>
  );
}
