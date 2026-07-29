"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input, Textarea } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/ui-select";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/ui-dialog";
import { createWorkProject, createWorkSession } from "@/lib/actions/work-actions";

/**
 * A Work project hangs off a workflow: that is where its brand instruction,
 * fonts, skills, and asset banks come from, so the workflow is picked up front.
 */
export function WorkProjectDialog({
  workflows,
  open,
  onOpenChange,
}: {
  workflows: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  const [workflowId, setWorkflowId] = React.useState(workflows[0]?.id ?? "");

  const noWorkflows = workflows.length === 0;

  async function submit() {
    if (!name.trim() || !workflowId) return;
    setLoading(true);
    try {
      const project = await createWorkProject({
        workflowId,
        name: name.trim(),
        instruction: instruction.trim() || undefined,
      });
      // A project with no session is a dead end — open one straight away.
      const session = await createWorkSession({ projectId: project.id });
      setName("");
      setInstruction("");
      onOpenChange(false);
      router.push(`/work/${session.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A place to keep related sessions. It inherits its workflow&apos;s
            instruction, fonts, skills, and assets.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Name" htmlFor="work-project-name">
            <Input
              id="work-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Feed experiments"
              autoFocus
            />
          </Field>
          <Field
            label="Workflow"
            hint={
              noWorkflows
                ? "Create a workflow first — it carries the brand context."
                : "Brand voice, fonts, skills, and asset banks come from here."
            }
          >
            <Select
              value={workflowId}
              onValueChange={setWorkflowId}
              disabled={noWorkflows}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Extra instruction"
            htmlFor="work-project-inst"
            hint="Optional. Layered on top of the workflow instruction."
          >
            <Textarea
              id="work-project-inst"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Keep everything square, muted palette, no stock-photo look."
              className="min-h-24"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={loading || noWorkflows || !name.trim()}
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              "Create project"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
