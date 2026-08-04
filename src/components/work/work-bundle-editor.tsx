"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Download,
  GripVertical,
  CalendarClock,
  Images,
  LoaderCircle,
  Share2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/ui-button";
import { useConfirm } from "@/components/confirm-provider";
import { Lightbox } from "@/components/run/image-lightbox";
import { WorkShareDialog } from "@/components/work/work-share-dialog";
import { Input } from "@/components/ui/ui-input";
import { DatePicker } from "@/components/ui/ui-date-picker";
import {
  deleteWorkBundle,
  removeBundleItem,
  reorderBundleItems,
  scheduleWorkBundle,
  updateWorkBundle,
} from "@/lib/actions/work-bundle-actions";
import {
  CAROUSEL_LIMIT,
  type WorkBundleDetail,
  type WorkBundleItem,
} from "@/lib/work-types";

const MOTION = "duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * The bundle's publish slot. It commits on change rather than behind a save
 * button: there is one value here, and a date picker that has already closed is
 * a decision the user considers made.
 */
function PublishRow({ bundle }: { bundle: WorkBundleDetail }) {
  const router = useRouter();
  const [date, setDate] = React.useState(bundle.publish?.date ?? "");
  const [time, setTime] = React.useState(bundle.publish?.time ?? "09:00");
  const [saving, setSaving] = React.useState(false);

  async function commit(nextDate: string, nextTime: string) {
    setSaving(true);
    try {
      await scheduleWorkBundle({
        id: bundle.id,
        publishDate: nextDate || null,
        publishTime: nextTime,
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b-2 border-border-soft px-5 py-2">
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-fg-muted">
        <CalendarClock className="size-3.5" />
        Publish
      </span>
      <DatePicker
        aria-label="Publish date"
        value={date}
        onChange={(next) => {
          setDate(next);
          void commit(next, time);
        }}
        className="h-8 w-48 text-xs"
      />
      {date ? (
        <>
          <Input
            type="time"
            aria-label="Publish time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              void commit(date, e.target.value);
            }}
            className="h-8 w-28 text-xs"
          />
          <span className="font-mono text-[10px] text-fg-muted">
            {bundle.timezone}
          </span>
        </>
      ) : (
        <span className="font-mono text-[11px] text-fg-muted">
          Optional — a date puts this bundle on the Calendar.
        </span>
      )}
      {saving ? (
        <LoaderCircle className="size-3.5 animate-spin text-fg-muted" />
      ) : null}
    </div>
  );
}

/**
 * One bundle, in slide order. Order is the whole value of this screen, so it is
 * shown as a big number on every tile and changed by dragging the tile itself.
 */
export function WorkBundleEditor({ bundle }: { bundle: WorkBundleDetail }) {
  const router = useRouter();
  const confirm = useConfirm();

  // Seeded from the server, then owned locally so a drag or a remove lands
  // instantly. Mounted with the bundle id as its key, so opening another bundle
  // starts from clean state rather than inheriting this one's.
  const [items, setItems] = React.useState<WorkBundleItem[]>(bundle.items);
  const [name, setName] = React.useState(bundle.name);
  const [busy, setBusy] = React.useState(false);
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);

  const sensors = useSensors(
    // A short threshold keeps a plain click available for the lightbox.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const offRatio = React.useMemo(
    () =>
      bundle.ratio
        ? items.filter((i) => i.render.ratio && i.render.ratio !== bundle.ratio)
            .length
        : 0,
    [items, bundle.ratio],
  );

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from === -1 || to === -1) return;

    const next = arrayMove(items, from, to);
    setItems(next);
    await reorderBundleItems({
      bundleId: bundle.id,
      itemIds: next.map((i) => i.id),
    });
    router.refresh();
  }

  async function remove(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    await removeBundleItem(itemId);
    router.refresh();
  }

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === bundle.name) {
      setName(bundle.name);
      return;
    }
    await updateWorkBundle({ id: bundle.id, name: trimmed });
    router.refresh();
  }

  async function destroy() {
    const ok = await confirm({
      title: `Delete "${bundle.name}"?`,
      description:
        "Only the bundle goes — the renders it points at stay in the gallery.",
      confirmLabel: "Delete bundle",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteWorkBundle(bundle.id);
      router.push(`/work/p/${bundle.projectId}/bundles`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b-2 border-border-soft px-5 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(bundle.name);
          }}
          aria-label="Bundle name"
          className="min-w-0 max-w-sm flex-1 rounded-[var(--radius-retro)] border-2 border-transparent bg-transparent px-1.5 py-1 font-display text-base font-bold outline-none transition-colors hover:border-border-soft focus-visible:border-ring focus-visible:bg-surface"
        />

        <span
          className={cn(
            "font-mono text-[11px] tabular-nums",
            items.length > CAROUSEL_LIMIT ? "text-danger" : "text-fg-muted",
          )}
          title={`Instagram allows ${CAROUSEL_LIMIT} slides per carousel`}
        >
          {items.length}/{CAROUSEL_LIMIT}
        </span>
        {bundle.ratio ? (
          <span className="font-mono text-[11px] text-fg-muted">
            {bundle.ratio}
          </span>
        ) : null}

        <span className="flex-1" />

        <Button size="sm" variant="outline" asChild>
          <Link href={`/work/p/${bundle.projectId}/gallery?add=${bundle.id}`}>
            <Images className="size-4" />
            Add renders
          </Link>
        </Button>
        <Button size="sm" variant="surface" asChild>
          <a href={`/api/bundles/${bundle.id}/download`} download>
            <Download className="size-4" />
            Download
          </a>
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setShareOpen(true)}
          disabled={items.length === 0}
        >
          <Share2 className="size-4" />
          Share
        </Button>
      </div>

      <PublishRow bundle={bundle} />

      {offRatio > 0 ? (
        <p className="flex shrink-0 items-center gap-2 border-b-2 border-border-soft bg-danger/10 px-5 py-2 text-xs text-danger">
          <TriangleAlert className="size-3.5 shrink-0" />
          {offRatio} slide{offRatio === 1 ? " does" : "s do"} not match{" "}
          {bundle.ratio}. Instagram crops every slide of a carousel to the same
          ratio.
        </p>
      ) : null}

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {items.length === 0 ? (
          <div className="rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft px-4 py-14 text-center">
            <p className="text-sm font-semibold">This bundle is empty</p>
            <p className="mx-auto mt-1 max-w-[20rem] text-xs leading-relaxed text-fg-muted">
              Add renders from the gallery, then drag them into the order you
              want them to appear in the carousel.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
                {items.map((item, index) => (
                  <SlideTile
                    key={item.id}
                    item={item}
                    index={index}
                    offRatio={
                      Boolean(bundle.ratio) &&
                      Boolean(item.render.ratio) &&
                      item.render.ratio !== bundle.ratio
                    }
                    onOpen={() => setLightboxIndex(index)}
                    onRemove={() => remove(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-border px-5 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
          Danger zone
        </p>
        <Button size="sm" variant="danger" onClick={destroy} disabled={busy}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          Delete bundle
        </Button>
      </div>

      {/* Mounted only while open: the dialog reads this machine's LAN addresses
          on mount, so every reopen re-reads them after a network change. */}
      {shareOpen ? (
        <WorkShareDialog
          bundleId={bundle.id}
          bundleName={bundle.name}
          slides={items.map((i) => ({
            url: i.render.url,
            filename: i.render.filename,
          }))}
          open
          onOpenChange={setShareOpen}
        />
      ) : null}

      <Lightbox
        images={items.map((i) => ({
          filename: i.render.filename,
          relPath: i.render.relPath,
          url: i.render.url,
        }))}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}

function SlideTile({
  item,
  index,
  offRatio,
  onOpen,
  onRemove,
}: {
  item: WorkBundleItem;
  index: number;
  offRatio: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-retro)] border-2 bg-surface-2",
        offRatio ? "border-danger" : "border-border",
        isDragging ? "z-10 opacity-80 shadow-hard-lg" : "shadow-hard-sm",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${item.render.filename}`}
        className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.render.url}
          alt={item.render.filename}
          loading="lazy"
          draggable={false}
          className="aspect-[4/5] w-full object-cover"
        />
      </button>

      <span className="pointer-events-none absolute left-2 top-2 grid size-7 place-items-center rounded-[3px] border-2 border-border bg-primary font-mono text-xs font-bold tabular-nums text-primary-fg">
        {index + 1}
      </span>

      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reorder ${item.render.filename}`}
        className={cn(
          "absolute right-2 top-2 grid size-7 cursor-grab place-items-center rounded-[3px] border-2 border-border bg-surface text-fg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
          `opacity-0 transition-opacity ${MOTION} group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none`,
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      <button
        type="button"
        onClick={onRemove}
        title="Remove from bundle"
        aria-label={`Remove ${item.render.filename} from bundle`}
        className={cn(
          "absolute right-2 top-11 grid size-7 place-items-center rounded-[3px] border-2 border-border bg-surface text-fg-muted outline-none hover:text-danger focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
          `opacity-0 transition-opacity ${MOTION} group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none`,
        )}
      >
        <X className="size-3.5" />
      </button>

      <div className="border-t-2 border-border bg-surface px-2 py-1.5">
        <p className="truncate font-mono text-[10px] text-fg">
          {item.render.filename}
        </p>
        <p className="mt-0.5 truncate font-mono text-[9px] text-fg-muted/80">
          {[item.render.sizeLabel, item.render.weightLabel]
            .filter(Boolean)
            .join(" · ") || "size unknown"}
        </p>
      </div>
    </div>
  );
}
