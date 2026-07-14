"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input, Textarea } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/ui-dialog";
import { MODEL_OPTIONS } from "@/lib/models";
import { createTask } from "@/lib/actions/task-actions";

export function TaskCreateDialog({
  workflowId,
  folders,
  variant = "primary",
}: {
  workflowId: string;
  folders: { id: string; name: string }[];
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  const [folderId, setFolderId] = React.useState<string>(
    folders[0]?.id ?? "none",
  );
  const [model, setModel] = React.useState("default");

  async function submit() {
    if (!name.trim()) return;
    setLoading(true);
    const res = await createTask({
      workflowId,
      name,
      instruction: instruction || undefined,
      assetFolderId: folderId === "none" ? null : folderId,
      model: model === "default" ? null : model,
    });
    setLoading(false);
    setOpen(false);
    router.push(`/tasks/${res.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <Plus className="size-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Claude runs this against the chosen asset folder and exports PNGs.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Name" htmlFor="task-name">
            <Input
              id="task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily 3-slide carousel"
              autoFocus
            />
          </Field>
          <Field
            label="Instruction"
            htmlFor="task-inst"
            hint="What to make. Combined with the workflow instruction."
          >
            <Textarea
              id="task-inst"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={
                "Make a 3-slide carousel: slide 1 hook, slide 2 tip, slide 3 CTA."
              }
              className="min-h-28"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={loading || !name.trim()}>
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              "Create task"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
