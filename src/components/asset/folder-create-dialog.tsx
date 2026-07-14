"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, LoaderCircle } from "lucide-react";
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
import { createFolder } from "@/lib/actions/asset-actions";

export function FolderCreateDialog({
  workflowId,
  variant = "primary",
}: {
  workflowId: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    await createFolder({
      workflowId,
      name: String(form.get("name") ?? ""),
      notes: String(form.get("notes") ?? "") || undefined,
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <FolderPlus className="size-4" /> New folder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New asset folder</DialogTitle>
            <DialogDescription>
              Group related photos. Tasks point Claude at one folder.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Name" htmlFor="folder-name">
              <Input
                id="folder-name"
                name="name"
                placeholder="July product shots"
                required
                autoFocus
              />
            </Field>
            <Field label="Notes" htmlFor="folder-notes" hint="Optional.">
              <Textarea
                id="folder-notes"
                name="notes"
                placeholder="Flatlay shots on cream background"
                className="min-h-20"
              />
            </Field>
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
