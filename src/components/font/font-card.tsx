"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Check } from "lucide-react";
import { Card } from "@/components/ui/ui-card";
import { Badge } from "@/components/ui/ui-badge";
import { Input } from "@/components/ui/ui-input";
import { Switch } from "@/components/ui/ui-switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import { FONT_CATEGORIES } from "@/lib/font-category";
import { useConfirm } from "@/components/confirm-provider";
import { updateFont, deleteFont } from "@/lib/actions/font-actions";

export interface FontCardData {
  id: string;
  family: string;
  category: string;
  moodTags: string;
  previewText: string;
  enabled: boolean;
  source: string;
  variantCount: number;
}

export function FontCard({ font }: { font: FontCardData }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [preview, setPreview] = React.useState(
    font.previewText || "The quick brown fox 123",
  );
  const [mood, setMood] = React.useState(font.moodTags);
  const [category, setCategory] = React.useState(font.category);
  const [enabled, setEnabled] = React.useState(font.enabled);
  const [saved, setSaved] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function queueSave(patch: Record<string, unknown>) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await updateFont({ id: font.id, ...patch });
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }, 500);
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete font?",
      description: `“${font.family}” and its files will be removed from the bank.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await deleteFont(font.id);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div
        className="min-h-16 break-words text-3xl leading-tight"
        style={{ fontFamily: `'${font.family}', sans-serif` }}
      >
        {preview || font.family}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display font-semibold">{font.family}</p>
          <p className="text-[10px] text-fg-muted font-mono">
            {font.source.toLowerCase()} · {font.variantCount} variant
            {font.variantCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved ? <Check className="size-3.5 text-primary" /> : null}
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              queueSave({ enabled: v });
            }}
          />
        </div>
      </div>

      <Input
        value={preview}
        onChange={(e) => {
          setPreview(e.target.value);
          queueSave({ previewText: e.target.value });
        }}
        className="h-8 text-xs"
        placeholder="Preview text"
      />

      <div className="grid grid-cols-2 gap-2">
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            queueSave({ category: v });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={mood}
          onChange={(e) => {
            setMood(e.target.value);
            queueSave({ moodTags: e.target.value });
          }}
          className="h-8 text-xs"
          placeholder="mood tags"
        />
      </div>

      <div className="flex items-center justify-between">
        <Badge tone="muted">{font.category.toLowerCase()}</Badge>
        <button
          onClick={remove}
          className="text-fg-muted hover:text-danger"
          title="Delete"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </Card>
  );
}
