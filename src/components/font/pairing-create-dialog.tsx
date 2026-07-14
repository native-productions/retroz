"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
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
import { createPairing } from "@/lib/actions/font-actions";

export function PairingCreateDialog({
  fonts,
}: {
  fonts: { id: string; family: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState("");
  const [heading, setHeading] = React.useState(fonts[0]?.id ?? "");
  const [body, setBody] = React.useState(fonts[1]?.id ?? fonts[0]?.id ?? "");
  const [mood, setMood] = React.useState("");

  async function submit() {
    if (!name.trim() || !heading || !body) return;
    setLoading(true);
    await createPairing({
      name,
      headingFontId: heading,
      bodyFontId: body,
      moodTags: mood || undefined,
    });
    setLoading(false);
    setOpen(false);
    setName("");
    setMood("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" disabled={fonts.length < 1}>
          <Plus className="size-4" /> New pairing
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New font pairing</DialogTitle>
          <DialogDescription>
            A coherent heading + body combo the AI can reach for.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Name" htmlFor="pair-name">
            <Input
              id="pair-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Retro Editorial"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Heading font">
              <Select value={heading} onValueChange={setHeading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fonts.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.family}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Body font">
              <Select value={body} onValueChange={setBody}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fonts.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.family}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Mood tags">
            <Input
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="editorial, punchy"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={loading}>
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
