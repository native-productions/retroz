"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Check,
  LoaderCircle,
  Pencil,
  X,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Input, Textarea } from "@/components/ui/ui-input";
import { mediaUrl } from "@/lib/media";
import { useConfirm } from "@/components/confirm-provider";
import { AssetTagsInput } from "@/components/asset/asset-tags-input";
import {
  updateAssetDescription,
  updateAssetTags,
  generateAssetCaptions,
  saveAssetCaption,
  deleteAsset,
  renameAsset,
} from "@/lib/actions/asset-actions";

interface AssetCardData {
  id: string;
  filename: string;
  relPath: string;
  width: number | null;
  height: number | null;
  description: string;
  tags: string[];
  autoDescribed: boolean;
}

interface Preview {
  description: string;
  tags: string[];
}

export function AssetCard({ asset }: { asset: AssetCardData }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [desc, setDesc] = React.useState(asset.description);
  const [tags, setTags] = React.useState<string[]>(asset.tags ?? []);
  const [saved, setSaved] = React.useState<"idle" | "saving" | "saved">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(asset.filename);
  const [renaming, setRenaming] = React.useState(false);

  // Auto-caption preview flow: generate → review → accept/discard.
  const [generating, setGenerating] = React.useState(false);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [captionError, setCaptionError] = React.useState<string | null>(null);

  async function saveName() {
    const next = name.trim();
    if (!next || next === asset.filename) {
      setEditing(false);
      setName(asset.filename);
      return;
    }
    setRenaming(true);
    await renameAsset({ id: asset.id, name: next });
    setRenaming(false);
    setEditing(false);
    router.refresh();
  }

  function onChange(v: string) {
    setDesc(v);
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await updateAssetDescription({ id: asset.id, description: v });
      setSaved("saved");
      setTimeout(() => setSaved("idle"), 1400);
    }, 700);
  }

  function onTagsChange(next: string[]) {
    setTags(next);
    setSaved("saving");
    if (tagTimer.current) clearTimeout(tagTimer.current);
    tagTimer.current = setTimeout(async () => {
      await updateAssetTags({ id: asset.id, tags: next });
      setSaved("saved");
      setTimeout(() => setSaved("idle"), 1400);
    }, 700);
  }

  async function generate() {
    setGenerating(true);
    setCaptionError(null);
    try {
      const [result] = await generateAssetCaptions({ ids: [asset.id] });
      if (!result || result.error) {
        setCaptionError(result?.error ?? "Caption failed.");
      } else {
        setPreview({ description: result.description, tags: result.tags });
      }
    } catch (err) {
      setCaptionError(err instanceof Error ? err.message : "Caption failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function acceptPreview() {
    if (!preview) return;
    setDesc(preview.description);
    setTags(preview.tags);
    await saveAssetCaption({
      id: asset.id,
      description: preview.description,
      tags: preview.tags,
    });
    setPreview(null);
    setSaved("saved");
    setTimeout(() => setSaved("idle"), 1400);
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete asset?",
      description: `“${asset.filename}” will be permanently removed.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await deleteAsset(asset.id);
    router.refresh();
  }

  return (
    <div className="retro-card overflow-hidden flex flex-col">
      <div className="relative bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(asset.relPath)}
          alt={asset.filename}
          className="aspect-[4/3] w-full object-cover"
        />
        <button
          onClick={generate}
          disabled={generating}
          title="Auto-caption with Claude"
          className="absolute left-2 top-2 grid size-8 place-items-center rounded-[var(--radius-retro)] border-2 border-border bg-surface text-primary retro-press disabled:opacity-60"
        >
          {generating ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
        </button>
        <button
          onClick={remove}
          title="Delete"
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-[var(--radius-retro)] border-2 border-border bg-surface text-danger retro-press"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          {editing ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Input
                autoFocus
                value={name}
                disabled={renaming}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setName(asset.filename);
                  }
                }}
                className="h-7 text-xs font-mono"
              />
              <button
                onClick={saveName}
                disabled={renaming}
                title="Save name"
                className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-retro)] border-2 border-border bg-surface text-primary retro-press"
              >
                {renaming ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setName(asset.filename);
                }}
                disabled={renaming}
                title="Cancel"
                className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-retro)] border-2 border-border bg-surface retro-press"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                title="Rename asset"
                className="group flex min-w-0 items-center gap-1.5 text-left"
              >
                <span className="truncate text-xs font-mono text-fg-muted">
                  {asset.filename}
                </span>
                <Pencil className="size-3 shrink-0 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              <span className="shrink-0 text-[10px] font-mono text-fg-muted">
                {asset.width && asset.height
                  ? `${asset.width}×${asset.height}`
                  : ""}
              </span>
            </>
          )}
        </div>

        {preview ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-retro)] border-2 border-primary/60 bg-primary/5 p-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-primary">
              <Wand2 className="size-3" /> Suggested caption
            </div>
            <p className="text-xs leading-snug">{preview.description}</p>
            {preview.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {preview.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border-2 border-border-soft bg-surface px-2 py-0.5 text-[10px] font-mono"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={acceptPreview}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-retro)] border-2 border-border bg-primary px-2 py-1 text-[11px] font-semibold text-primary-fg retro-press"
              >
                <Check className="size-3" /> Accept
              </button>
              <button
                onClick={() => setPreview(null)}
                className="inline-flex items-center justify-center gap-1 rounded-[var(--radius-retro)] border-2 border-border bg-surface px-2 py-1 text-[11px] font-semibold retro-press"
              >
                <X className="size-3" /> Discard
              </button>
            </div>
          </div>
        ) : null}

        <Textarea
          value={desc}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe this asset for Claude…"
          className="min-h-16 text-xs"
        />
        <AssetTagsInput value={tags} onChange={onTagsChange} />
        <div className="flex h-4 items-center justify-between text-[10px] font-mono text-fg-muted">
          <span>
            {captionError ? (
              <span className="text-danger">{captionError}</span>
            ) : asset.autoDescribed && !preview ? (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3" /> auto
              </span>
            ) : null}
          </span>
          <span>
            {saved === "saving" ? (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle className="size-3 animate-spin" /> saving
              </span>
            ) : saved === "saved" ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <Check className="size-3" /> saved
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
