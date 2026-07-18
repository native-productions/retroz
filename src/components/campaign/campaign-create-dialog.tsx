"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, LoaderCircle, Paperclip } from "lucide-react";
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
import { MODEL_OPTIONS, PROVIDER_OPTIONS } from "@/lib/models";
import { createCampaign } from "@/lib/actions/campaign-actions";

export function CampaignCreateDialog({
  workflowId,
  variant = "primary",
}: {
  workflowId: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState("");
  const [brief, setBrief] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [format, setFormat] = React.useState<"SINGLE" | "CAROUSEL">("SINGLE");
  const [model, setModel] = React.useState<string>("default");

  async function submit() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { id } = await createCampaign({
        workflowId,
        name: name.trim(),
        brief: brief.trim() || undefined,
        format,
        model: model === "default" ? undefined : model,
      });
      if (file) {
        const form = new FormData();
        form.set("campaignId", id);
        form.set("file", file);
        await fetch("/api/campaigns/brief", { method: "POST", body: form });
      }
      setOpen(false);
      router.push(`/campaigns/${id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <CalendarRange className="size-4" /> New campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            Describe the campaign; the planner drafts a multi-day content calendar.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Name" htmlFor="cmp-name">
            <Input
              id="cmp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ramadan product push"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Format" hint="Images per post.">
              <Select
                value={format}
                onValueChange={(v) => setFormat(v as "SINGLE" | "CAROUSEL")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">Single · 1 image</SelectItem>
                  <SelectItem value="CAROUSEL">Carousel · 3–8 images</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Model" hint="Engine for planning + render.">
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Workflow default</SelectItem>
                  {PROVIDER_OPTIONS.map((p) =>
                    MODEL_OPTIONS[p.value].map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {p.label} · {m.label}
                      </SelectItem>
                    )),
                  )}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field
            label="Campaign brief"
            hint="What to promote, angle, tone. The planner reads this."
          >
            <Textarea
              rows={6}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Paste your brief, or attach a .md / .txt / .pdf below."
            />
          </Field>
          <Field label="Attach brief file (optional)" hint=".md, .txt, or .pdf">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
              <Paperclip className="size-4" />
              <span className="font-mono">
                {file ? file.name : "Choose file…"}
              </span>
              <input
                type="file"
                accept=".md,.txt,.markdown,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
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
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
