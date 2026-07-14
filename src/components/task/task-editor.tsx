"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input, Textarea } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/ui-card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import { MODEL_OPTIONS } from "@/lib/models";
import { updateTask } from "@/lib/actions/task-actions";

export function TaskEditor({
  taskId,
  initialName,
  initialInstruction,
  initialFolderId,
  initialModel,
  folders,
}: {
  taskId: string;
  initialName: string;
  initialInstruction: string;
  initialFolderId: string | null;
  initialModel: string | null;
  folders: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [instruction, setInstruction] = React.useState(initialInstruction);
  const [folderId, setFolderId] = React.useState<string>(
    initialFolderId ?? "none",
  );
  const [model, setModel] = React.useState<string>(initialModel ?? "default");
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setState("saving");
    await updateTask({
      id: taskId,
      name: name.trim() || initialName,
      instruction,
      assetFolderId: folderId === "none" ? null : folderId,
      model: model === "default" ? null : model,
    });
    setState("saved");
    setTimeout(() => setState("idle"), 1600);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Instruction</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="July — Week 1 carousel"
                maxLength={80}
              />
            </Field>
            <Field
              label="Instruction"
              hint="What to make. Combined with the workflow instruction."
            >
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={
                  "Make a 3-slide carousel: slide 1 hook, slide 2 tip, slide 3 CTA."
                }
                className="min-h-56 font-mono"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Config</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Asset folder">
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No folder</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Model">
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Workflow default</SelectItem>
                  {MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
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
    </div>
  );
}
