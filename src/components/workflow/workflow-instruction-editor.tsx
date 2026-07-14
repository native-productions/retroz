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
import { MODEL_OPTIONS } from "@/lib/models";
import { updateWorkflow, deleteWorkflow } from "@/lib/actions/workflow-actions";

export function WorkflowInstructionEditor({
  workflowId,
  workflowName,
  initialInstruction,
  initialModel,
}: {
  workflowId: string;
  workflowName: string;
  initialInstruction: string;
  initialModel: string | null;
}) {
  const [instruction, setInstruction] = React.useState(initialInstruction);
  const [model, setModel] = React.useState<string>(initialModel ?? "default");
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setState("saving");
    await updateWorkflow({
      id: workflowId,
      globalInstruction: instruction,
      defaultModel: model === "default" ? null : model,
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

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Default model" className="w-56">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Use app default</SelectItem>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
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
