"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input, Textarea } from "@/components/ui/ui-input";
import { Field, Label } from "@/components/ui/ui-label";
import { Switch } from "@/components/ui/ui-switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/ui-dialog";
import { upsertSkill } from "@/lib/actions/skill-actions";

export interface SkillFormValue {
  id?: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}

export function SkillEditorDialog({
  open,
  onOpenChange,
  skill,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  skill?: SkillFormValue;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState(skill?.name ?? "");
  const [description, setDescription] = React.useState(
    skill?.description ?? "",
  );
  const [content, setContent] = React.useState(skill?.content ?? "");
  const [enabled, setEnabled] = React.useState(skill?.enabled ?? true);

  React.useEffect(() => {
    if (open) {
      setName(skill?.name ?? "");
      setDescription(skill?.description ?? "");
      setContent(skill?.content ?? "");
      setEnabled(skill?.enabled ?? true);
    }
  }, [open, skill]);

  async function submit() {
    if (!name.trim()) return;
    setLoading(true);
    await upsertSkill({ id: skill?.id, name, description, content, enabled });
    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,44rem)]">
        <DialogHeader>
          <DialogTitle>{skill?.id ? "Edit skill" : "New skill"}</DialogTitle>
          <DialogDescription>
            Saved to <code>.claude/skills/&lt;slug&gt;/SKILL.md</code> — Claude
            loads it on the next run.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="skill-name">
              <Input
                id="skill-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="instagram-carousel"
                disabled={Boolean(skill?.id)}
              />
            </Field>
            <div className="flex items-end justify-between gap-2 pb-1">
              <Label>Enabled</Label>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
          <Field label="Description" htmlFor="skill-desc">
            <Input
              id="skill-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="How to lay out engaging IG education carousels"
            />
          </Field>
          <Field
            label="SKILL.md body"
            htmlFor="skill-content"
            hint="Markdown instructions Claude follows when the skill activates."
          >
            <Textarea
              id="skill-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"# Instagram Carousel\n\nWhen making carousels:\n- One idea per slide\n- Bold headline top, support text below"}
              className="min-h-64"
            />
          </Field>
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
            ) : skill?.id ? (
              "Save"
            ) : (
              "Create skill"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
