"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, LoaderCircle } from "lucide-react";
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
import { renameFolder } from "@/lib/actions/asset-actions";

export function FolderRenameDialog({
  folderId,
  name,
  notes,
}: {
  folderId: string;
  name: string;
  notes?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    await renameFolder({
      id: folderId,
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
        <Button variant="secondary" size="sm">
          <Pencil className="size-4" /> Rename
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>
              Updates the folder name and notes. Uploaded photos stay in place.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Name" htmlFor="rename-name">
              <Input
                id="rename-name"
                name="name"
                defaultValue={name}
                placeholder="July product shots"
                required
                autoFocus
              />
            </Field>
            <Field label="Notes" htmlFor="rename-notes" hint="Optional.">
              <Textarea
                id="rename-notes"
                name="notes"
                defaultValue={notes ?? ""}
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
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
