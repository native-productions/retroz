"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input, Textarea } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
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
import { createWorkflow } from "@/lib/actions/workflow-actions";

export function WorkflowCreateDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await createWorkflow({
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? "") || undefined,
        platform: "instagram",
      });
      // createWorkflow redirects on success; if we get here just refresh
      router.refresh();
    } catch (err) {
      // redirect() throws NEXT_REDIRECT — let it bubble
      if (err && typeof err === "object" && "digest" in err) throw err;
      setError("Could not create workflow.");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New workflow
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New workflow</DialogTitle>
            <DialogDescription>
              A workflow groups an instruction, assets, tasks, and schedules for
              one channel.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Name" htmlFor="wf-name">
              <Input
                id="wf-name"
                name="name"
                placeholder="Instagram — Education"
                required
                autoFocus
              />
            </Field>
            <Field label="Description" htmlFor="wf-desc" hint="Optional.">
              <Textarea
                id="wf-desc"
                name="description"
                placeholder="Daily educational carousels for @native.academy"
                className="min-h-20"
              />
            </Field>
            {error ? (
              <p className="text-sm text-danger font-medium">{error}</p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
