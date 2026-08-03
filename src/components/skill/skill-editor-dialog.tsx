"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
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
import {
  SKILL_CONTENT_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
} from "@/lib/skill-limits";

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
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(skill?.name ?? "");
      setDescription(skill?.description ?? "");
      setContent(skill?.content ?? "");
      setEnabled(skill?.enabled ?? true);
      setFailure(null);
    }
  }, [open, skill]);

  // Mirrors skillUpsertSchema. Checked while typing so an oversized paste says
  // so on the field itself, instead of the action throwing a raw zod issue list.
  const errors = {
    name: !name.trim()
      ? "Name the skill."
      : name.length > SKILL_NAME_MAX
        ? `${name.length} of ${SKILL_NAME_MAX} characters — shorten the name.`
        : null,
    description:
      description.length > SKILL_DESCRIPTION_MAX
        ? `${overBy(description.length, SKILL_DESCRIPTION_MAX)} too long. The description is one line of frontmatter, capped at ${SKILL_DESCRIPTION_MAX} characters.`
        : null,
    content:
      content.length > SKILL_CONTENT_MAX
        ? `${overBy(content.length, SKILL_CONTENT_MAX)} too long. The body is capped at ${format(SKILL_CONTENT_MAX)} characters.`
        : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit() {
    if (invalid || loading) return;
    setLoading(true);
    setFailure(null);
    try {
      await upsertSkill({ id: skill?.id, name, description, content, enabled });
      onOpenChange(false);
      router.refresh();
    } catch (cause) {
      setFailure(
        cause instanceof Error && cause.message
          ? cause.message
          : "Could not save the skill.",
      );
    } finally {
      setLoading(false);
    }
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
            <Field
              label="Name"
              htmlFor="skill-name"
              error={name.length > 0 ? errors.name : null}
            >
              <Input
                id="skill-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="instagram-carousel"
                disabled={Boolean(skill?.id)}
                aria-invalid={Boolean(name.length > 0 && errors.name)}
              />
            </Field>
            <div className="flex items-end justify-between gap-2 pb-1">
              <Label>Enabled</Label>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
          <Field
            label="Description"
            htmlFor="skill-desc"
            error={errors.description}
            meta={
              <Counter length={description.length} max={SKILL_DESCRIPTION_MAX} />
            }
          >
            <Input
              id="skill-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="How to lay out engaging IG education carousels"
              aria-invalid={Boolean(errors.description)}
            />
          </Field>
          <Field
            label="SKILL.md body"
            htmlFor="skill-content"
            hint="Markdown instructions Claude follows when the skill activates."
            error={errors.content}
            meta={<Counter length={content.length} max={SKILL_CONTENT_MAX} />}
          >
            <Textarea
              id="skill-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"# Instagram Carousel\n\nWhen making carousels:\n- One idea per slide\n- Bold headline top, support text below"}
              className="min-h-64"
              aria-invalid={Boolean(errors.content)}
            />
          </Field>

          {failure ? (
            <p
              role="alert"
              className="rounded-[var(--radius-retro)] border-2 border-danger bg-danger/10 px-3 py-2 text-xs font-semibold text-danger"
            >
              {failure}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={loading || invalid}>
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

const format = (n: number) => n.toLocaleString("en-US");

/** "1,204 characters over" — the amount to cut, which is what the user needs. */
const overBy = (length: number, max: number) =>
  `${format(length - max)} character${length - max === 1 ? "" : "s"}`;

/** Stays quiet until the value is close to the cap, then counts down. */
function Counter({ length, max }: { length: number; max: number }) {
  const over = length > max;
  if (!over && length < max * 0.8) return null;
  return (
    <span
      className={cn(
        "font-mono text-[10px] tabular-nums",
        over ? "font-semibold text-danger" : "text-fg-muted",
      )}
    >
      {format(length)} / {format(max)}
    </span>
  );
}
