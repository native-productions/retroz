"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import { DatePicker } from "@/components/ui/ui-date-picker";
import { Field } from "@/components/ui/ui-label";
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
import { createWorkBundle } from "@/lib/actions/work-bundle-actions";
import { CAROUSEL_LIMIT } from "@/lib/work-types";

/**
 * Names a bundle and creates it from renders the caller already has in order.
 *
 * It deliberately does not navigate on success: this is used from the canvas
 * beside a live conversation, so it reports what it made and leaves the choice
 * of opening it to the user.
 */
export function WorkBundleDialog({
  projectId,
  artifactIds,
  defaultName,
  open,
  onOpenChange,
}: {
  projectId: string;
  /** Renders to save, in the order they should appear as slides. */
  artifactIds: string[];
  /** Prefilled name — the session title, so the field is usually just accepted. */
  defaultName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(defaultName);
  const [publishDate, setPublishDate] = React.useState("");
  const [publishTime, setPublishTime] = React.useState("09:00");
  const [saving, setSaving] = React.useState(false);
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Reopening is a fresh save: drop the previous result and take the current
  // session title again, which may have changed since the last one.
  React.useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setPublishDate("");
    setPublishTime("09:00");
    setSavedId(null);
    setError(null);
  }, [open, defaultName]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || saving || artifactIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const bundle = await createWorkBundle({
        projectId,
        name: trimmed,
        artifactIds,
        publishDate: publishDate || null,
        publishTime,
      });
      setSavedId(bundle.id);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the bundle.",
      );
    } finally {
      setSaving(false);
    }
  }

  const count = artifactIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as bundle</DialogTitle>
          <DialogDescription>
            {savedId
              ? "Saved. The bundle points at these renders — reorder or trim it any time."
              : `Collects ${count} render${count === 1 ? "" : "s"} into one ordered post, newest last.`}
          </DialogDescription>
        </DialogHeader>

        {savedId ? null : (
          <DialogBody>
            <Field
              label="Bundle name"
              htmlFor="work-bundle-name"
              hint={
                count > CAROUSEL_LIMIT
                  ? `That is over Instagram's ${CAROUSEL_LIMIT}-slide limit — drop a few in the editor before posting.`
                  : undefined
              }
            >
              <Input
                id="work-bundle-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                placeholder="Launch carousel"
                autoFocus
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Field
                label="Publish date"
                htmlFor="work-bundle-date"
                hint={
                  publishDate
                    ? undefined
                    : "Optional. A date puts this bundle on the Calendar."
                }
              >
                <DatePicker
                  id="work-bundle-date"
                  value={publishDate}
                  onChange={setPublishDate}
                  className="w-52"
                />
              </Field>
              {publishDate ? (
                <Field
                  label="Time"
                  htmlFor="work-bundle-time"
                  hint="App timezone — Settings › Schedule."
                >
                  <Input
                    id="work-bundle-time"
                    type="time"
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    className="w-32"
                  />
                </Field>
              ) : null}
            </div>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </DialogBody>
        )}

        <DialogFooter className={savedId ? "pt-5" : undefined}>
          {savedId ? (
            <>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Stay here
                </Button>
              </DialogClose>
              <Button asChild>
                <Link href={`/work/p/${projectId}/bundles/${savedId}`}>
                  Open bundle
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button onClick={submit} disabled={saving || !name.trim()}>
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  "Save bundle"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
