"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, RefreshCw, Sparkles, ImageIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media";
import { Button } from "@/components/ui/ui-button";
import { Input, Textarea } from "@/components/ui/ui-input";
import { Card } from "@/components/ui/ui-card";
import { Markdown } from "@/components/markdown";
import { ActionButton } from "@/components/ui/ui-action-button";
import {
  updateCampaignItem,
  deleteCampaignItem,
  rerollCampaignItem,
  addCampaignItem,
  assignItemAssets,
  runPlanner,
} from "@/lib/actions/campaign-actions";

interface Item {
  id: string;
  dayIndex: number;
  slotIndex: number;
  title: string;
  angle: string | null;
  instruction: string;
  caption: string | null;
  status: string;
  assetIds: string[];
}

interface AssetLite {
  id: string;
  filename: string;
  relPath: string;
}

export function CampaignCalendarEditor({
  campaignId,
  editable,
  items,
  assets,
}: {
  campaignId: string;
  editable: boolean;
  items: Item[];
  assets: AssetLite[];
}) {
  const router = useRouter();
  const byDay = React.useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const it of items) {
      const list = map.get(it.dayIndex) ?? [];
      list.push(it);
      map.set(it.dayIndex, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);

  const nextDay = byDay.length ? byDay[byDay.length - 1][0] : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Content calendar</h3>
        {editable ? (
          <div className="flex items-center gap-2">
            <ActionButton
              action={() => runPlanner(campaignId, "full").then(() => {})}
              confirm={{
                title: "Regenerate the whole calendar?",
                description: "This replaces all draft items with a fresh plan.",
                confirmLabel: "Regenerate",
                tone: "danger",
              }}
              variant="outline"
              size="sm"
            >
              <Sparkles className="size-4" /> Replan all
            </ActionButton>
            <ActionButton
              action={() =>
                addCampaignItem({
                  campaignId,
                  dayIndex: nextDay,
                  slotIndex: 0,
                  title: "New post",
                }).then(() => router.refresh())
              }
              variant="secondary"
              size="sm"
            >
              <Plus className="size-4" /> Add item
            </ActionButton>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="font-mono text-sm text-fg-muted">
          No calendar yet. Run the planner to draft one.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {byDay.map(([day, dayItems]) => (
            <div key={day} className="flex flex-col gap-2">
              <p className="font-mono text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Day {day}
              </p>
              <div className="flex flex-col gap-3">
                {dayItems
                  .sort((a, b) => a.slotIndex - b.slotIndex)
                  .map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      editable={editable}
                      assets={assets}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemCard({
  item,
  editable,
  assets,
}: {
  item: Item;
  editable: boolean;
  assets: AssetLite[];
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState(item.title);
  const [instruction, setInstruction] = React.useState(item.instruction);
  const [caption, setCaption] = React.useState(item.caption ?? "");
  const [, startSave] = React.useTransition();

  function save(patch: Record<string, unknown>) {
    startSave(() => {
      void updateCampaignItem({ id: item.id, ...patch });
    });
  }

  const assigned = new Set(item.assetIds);

  function toggleAsset(assetId: string) {
    const next = new Set(assigned);
    if (next.has(assetId)) next.delete(assetId);
    else next.add(assetId);
    void assignItemAssets({ itemId: item.id, assetIds: [...next] }).then(() =>
      router.refresh(),
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {editable ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== item.title && save({ title })}
              className="font-display font-semibold"
            />
          ) : (
            <p className="font-display font-semibold">{item.title}</p>
          )}
          {item.angle ? (
            <p className="mt-1 text-xs text-fg-muted">{item.angle}</p>
          ) : null}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-fg-muted">
          slot {item.slotIndex + 1}
        </span>
        {editable ? (
          <div className="flex shrink-0 items-center gap-1">
            <ActionButton
              action={() => rerollCampaignItem(item.id).then(() => {})}
              variant="ghost"
              size="icon"
              title="Regenerate this item with AI"
            >
              <RefreshCw className="size-4" />
            </ActionButton>
            <ActionButton
              action={() => deleteCampaignItem(item.id).then(() => router.refresh())}
              confirm={`Delete "${item.title}"?`}
              variant="ghost"
              size="icon"
            >
              <Trash2 className="size-4" />
            </ActionButton>
          </div>
        ) : null}
      </div>

      {editable ? (
        <div className="flex flex-col gap-1.5">
          <Textarea
            rows={4}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onBlur={() => instruction !== item.instruction && save({ instruction })}
            placeholder="Render instruction for this post… (Markdown supported)"
            className="max-h-72 resize-y overflow-y-auto font-mono text-xs"
          />
          {instruction.trim() ? (
            <details className="text-xs">
              <summary className="cursor-pointer font-mono text-[11px] text-fg-muted">
                Preview
              </summary>
              <div className="mt-1.5 max-h-72 overflow-y-auto rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface-2 px-3 py-2">
                <Markdown className="text-xs">{instruction}</Markdown>
              </div>
            </details>
          ) : null}
        </div>
      ) : item.instruction.trim() ? (
        <div className="max-h-72 overflow-y-auto rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface-2 px-3 py-2">
          <Markdown className="text-xs">{item.instruction}</Markdown>
        </div>
      ) : (
        <p className="font-mono text-xs text-fg-muted">(no instruction)</p>
      )}

      {editable ? (
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() =>
            caption !== (item.caption ?? "") &&
            save({ caption: caption || null })
          }
          placeholder="Caption (optional)"
          className="text-xs"
        />
      ) : item.caption ? (
        <p className="text-xs text-fg-muted">{item.caption}</p>
      ) : null}

      {assets.length > 0 ? (
        <details className="text-xs">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-fg-muted">
            <ImageIcon className="size-3.5" />
            Photos · {assigned.size}/{assets.length}
          </summary>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {assets.map((a) => {
              const on = assigned.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={!editable}
                  onClick={() => toggleAsset(a.id)}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-[4px] border-2",
                    on ? "border-primary" : "border-border-soft opacity-60",
                  )}
                  title={a.filename}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(a.relPath)}
                    alt={a.filename}
                    className="size-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </details>
      ) : null}
    </Card>
  );
}
