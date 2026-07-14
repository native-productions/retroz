"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Check, LoaderCircle } from "lucide-react";
import { Textarea } from "@/components/ui/ui-input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import { mediaUrl } from "@/lib/media";
import { useConfirm } from "@/components/confirm-provider";
import {
  updateGlobalAsset,
  deleteGlobalAsset,
} from "@/lib/actions/global-asset-actions";

const KINDS = [
  { value: "BACKGROUND", label: "Background" },
  { value: "LOGO", label: "Logo / Brand" },
  { value: "PATTERN", label: "SVG Pattern" },
  { value: "OTHER", label: "Other" },
];

export interface GlobalAssetData {
  id: string;
  filename: string;
  relPath: string;
  kind: string;
  description: string;
}

export function GlobalAssetCard({ asset }: { asset: GlobalAssetData }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [desc, setDesc] = React.useState(asset.description);
  const [kind, setKind] = React.useState(asset.kind);
  const [saved, setSaved] = React.useState<"idle" | "saving" | "saved">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function queueSave(patch: { description?: string; kind?: string }) {
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await updateGlobalAsset({ id: asset.id, ...patch });
      setSaved("saved");
      setTimeout(() => setSaved("idle"), 1300);
    }, 500);
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete global asset?",
      description: `“${asset.filename}” will be removed from this workflow.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await deleteGlobalAsset(asset.id);
    router.refresh();
  }

  return (
    <div className="retro-card overflow-hidden flex flex-col">
      <div className="relative h-28 overflow-hidden bg-[repeating-conic-gradient(var(--surface-2)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(asset.relPath)}
          alt={asset.filename}
          className="absolute inset-0 size-full object-contain p-3"
        />
        <button
          onClick={remove}
          title="Delete"
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-[var(--radius-retro)] border-2 border-border bg-surface text-danger retro-press"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <p className="truncate text-xs font-mono text-fg-muted">
          {asset.filename}
        </p>
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v);
            queueSave({ kind: v });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={desc}
          onChange={(e) => {
            setDesc(e.target.value);
            queueSave({ description: e.target.value });
          }}
          placeholder="Describe this asset + when to use it…"
          className="min-h-14 text-xs"
        />
        <div className="h-4 text-[10px] font-mono text-fg-muted">
          {saved === "saving" ? (
            <span className="inline-flex items-center gap-1">
              <LoaderCircle className="size-3 animate-spin" /> saving
            </span>
          ) : saved === "saved" ? (
            <span className="inline-flex items-center gap-1 text-primary">
              <Check className="size-3" /> saved
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
