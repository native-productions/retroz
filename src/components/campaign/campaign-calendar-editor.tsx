"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  ImageIcon,
  CalendarDays,
  CalendarClock,
  Film,
  ArrowUpRight,
} from "lucide-react";
import { mediaUrl } from "@/lib/media";
import { Badge } from "@/components/ui/ui-badge";
import { Input, Textarea } from "@/components/ui/ui-input";
import { Markdown } from "@/components/markdown";
import { ActionButton } from "@/components/ui/ui-action-button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/ui-dialog";
import {
  updateCampaignItem,
  deleteCampaignItem,
  rerollCampaignItem,
  addCampaignItem,
  runPlanner,
} from "@/lib/actions/campaign-actions";

interface ItemRun {
  id: string;
  status: string;
  /** Formatted run time in the campaign timezone. */
  label: string;
  /** PNG artifact preview, if the run produced one. */
  thumb: string | null;
}

interface Item {
  id: string;
  dayIndex: number;
  slotIndex: number;
  title: string;
  angle: string | null;
  instruction: string;
  caption: string | null;
  status: string;
  /** Formatted date/time in the campaign timezone; null while still a draft. */
  scheduledLabel: string | null;
  runs: ItemRun[];
}

const STATUS_TONE: Record<string, React.ComponentProps<typeof Badge>["tone"]> = {
  DRAFT: "muted",
  QUEUED: "muted",
  SCHEDULED: "secondary",
  RUNNING: "accent",
  DONE: "primary",
  FAILED: "danger",
  CANCELLED: "muted",
  SKIPPED: "muted",
};

function StatusPill({ status }: { status: string }) {
  return (
    <Badge
      tone={STATUS_TONE[status] ?? "muted"}
      className="px-1.5 py-0 text-[9px] uppercase"
    >
      {status.toLowerCase()}
    </Badge>
  );
}

export function CampaignCalendarEditor({
  campaignId,
  editable,
  items,
}: {
  campaignId: string;
  editable: boolean;
  items: Item[];
}) {
  const router = useRouter();

  const byDay = React.useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const it of items) {
      const list = map.get(it.dayIndex) ?? [];
      list.push(it);
      map.set(it.dayIndex, list);
    }
    for (const list of map.values())
      list.sort((a, b) => a.slotIndex - b.slotIndex);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);

  const lastDay = byDay.length ? byDay[byDay.length - 1][0] : 1;

  function addToDay(day: number, dayItems: Item[]) {
    const nextSlot = dayItems.reduce((m, i) => Math.max(m, i.slotIndex + 1), 0);
    void addCampaignItem({
      campaignId,
      dayIndex: day,
      slotIndex: nextSlot,
      title: "New post",
    }).then(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 font-display text-lg font-semibold">
          <CalendarDays className="size-5 text-secondary" /> Content calendar
        </h3>
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
                  dayIndex: lastDay + 1,
                  slotIndex: 0,
                  title: "New post",
                }).then(() => router.refresh())
              }
              variant="secondary"
              size="sm"
            >
              <Plus className="size-4" /> Add day
            </ActionButton>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="font-mono text-sm text-fg-muted">
          No calendar yet. Run the planner to draft one.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {byDay.map(([day, dayItems]) => (
            <div
              key={day}
              className="flex min-h-40 flex-col gap-2 rounded-[var(--radius-retro)] border-2 border-border bg-surface-2/40 p-2.5"
            >
              <div className="flex items-center justify-between px-0.5">
                <p className="font-display text-sm font-semibold">Day {day}</p>
                <span className="font-mono text-[10px] text-fg-muted">
                  {dayItems.length} post{dayItems.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {dayItems.map((item) => (
                  <ItemCell key={item.id} item={item} editable={editable} />
                ))}
              </div>

              {editable ? (
                <button
                  type="button"
                  onClick={() => addToDay(day, dayItems)}
                  className="inline-flex items-center justify-center gap-1 rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft py-1.5 font-mono text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg"
                >
                  <Plus className="size-3.5" /> Add post
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- calendar cell: compact chip that opens the full editor in a dialog ---
function ItemCell({ item, editable }: { item: Item; editable: boolean }) {
  const [open, setOpen] = React.useState(false);
  const thumb = item.runs.find((r) => r.thumb)?.thumb ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-start gap-2 rounded-[var(--radius-retro)] border-2 border-border bg-surface p-2 text-left shadow-hard-sm transition-transform hover:-translate-y-0.5"
        >
          <div className="relative size-9 shrink-0 overflow-hidden rounded-[4px] border-2 border-border-soft bg-surface-2">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl(thumb)}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center text-fg-muted">
                <ImageIcon className="size-4" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xs font-semibold">
              {item.title}
            </p>
            {item.scheduledLabel ? (
              <p className="mt-0.5 inline-flex items-center gap-1 truncate font-mono text-[9px] text-fg-muted">
                <CalendarClock className="size-2.5 shrink-0" />
                {item.scheduledLabel}
              </p>
            ) : null}
            <div className="mt-1 flex items-center gap-1.5">
              <span className="font-mono text-[9px] text-fg-muted">
                S{item.slotIndex + 1}
              </span>
              <StatusPill status={item.status} />
              {item.runs.length > 0 ? (
                <span className="inline-flex items-center gap-0.5 font-mono text-[9px] text-fg-muted">
                  <Film className="size-2.5" />
                  {item.runs.length}
                </span>
              ) : null}
            </div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="w-[min(94vw,40rem)]">
        {open ? (
          <ItemEditor
            item={item}
            editable={editable}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// --- editor body (dialog content) ---
function ItemEditor({
  item,
  editable,
  onClose,
}: {
  item: Item;
  editable: boolean;
  onClose: () => void;
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

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          Day {item.dayIndex} · Slot {item.slotIndex + 1}
          <StatusPill status={item.status} />
        </DialogTitle>
        {item.scheduledLabel ? (
          <p className="inline-flex items-center gap-1.5 font-mono text-xs text-fg-muted">
            <CalendarClock className="size-3.5" /> {item.scheduledLabel}
          </p>
        ) : null}
        {item.angle ? <DialogDescription>{item.angle}</DialogDescription> : null}
      </DialogHeader>

      <DialogBody>
        {/* Title */}
        {editable ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== item.title && save({ title })}
            className="font-display font-semibold"
            placeholder="Post title"
          />
        ) : (
          <p className="font-display font-semibold">{item.title}</p>
        )}

        {/* Instruction */}
        {editable ? (
          <div className="flex flex-col gap-1.5">
            <Textarea
              rows={5}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onBlur={() =>
                instruction !== item.instruction && save({ instruction })
              }
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

        {/* Caption */}
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

        {/* Runs for this post's task */}
        <div className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fg-muted">
            <Film className="size-3.5" /> Runs · {item.runs.length}
          </p>
          {item.runs.length > 0 ? (
            <div className="flex flex-col gap-2">
              {item.runs.map((r) => (
                <Link
                  key={r.id}
                  href={`/runs/${r.id}`}
                  className="flex items-center gap-3 rounded-[var(--radius-retro)] border-2 border-border bg-surface p-2 shadow-hard-sm transition-transform hover:-translate-y-0.5"
                >
                  <div className="size-11 shrink-0 overflow-hidden rounded-[4px] border-2 border-border-soft bg-surface-2">
                    {r.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaUrl(r.thumb)}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-fg-muted">
                        <ImageIcon className="size-4" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <StatusPill status={r.status} />
                    <p className="mt-1 truncate font-mono text-[10px] text-fg-muted">
                      {r.label}
                    </p>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0 text-fg-muted" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="font-mono text-xs text-fg-muted">
              No runs yet for this post.
            </p>
          )}
        </div>
      </DialogBody>

      {editable ? (
        <DialogFooter className="justify-between">
          <ActionButton
            action={() =>
              deleteCampaignItem(item.id).then(() => {
                onClose();
                router.refresh();
              })
            }
            confirm={`Delete "${item.title}"?`}
            variant="danger"
            size="sm"
          >
            <Trash2 className="size-4" /> Delete
          </ActionButton>
          <ActionButton
            action={() => rerollCampaignItem(item.id).then(() => onClose())}
            variant="outline"
            size="sm"
            title="Regenerate this item with AI"
          >
            <RefreshCw className="size-4" /> Reroll
          </ActionButton>
        </DialogFooter>
      ) : null}
    </>
  );
}
