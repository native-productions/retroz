"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Images,
  Layers,
  LoaderCircle,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/ui-button";
import { Lightbox } from "@/components/run/image-lightbox";
import {
  addArtifactsToBundle,
  createWorkBundle,
} from "@/lib/actions/work-bundle-actions";
import { CAROUSEL_LIMIT, type WorkRender } from "@/lib/work-types";

// The project's shared curve, matching work-canvas and the sidebar. Written out
// in full so Tailwind's scanner can see the arbitrary value.
const MOTION = "duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";
const MOTION_FAST = "duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]";

/** Add-mode: the gallery is picking slides for a bundle that already exists. */
export interface GalleryTarget {
  id: string;
  name: string;
}

/**
 * Every render a project has produced, grouped by the day it was made.
 *
 * Selection is the whole point of this screen, so it stays inline: a click
 * toggles a render and the tile takes a numbered badge in the order it was
 * picked. That number is the carousel order, decided while choosing rather than
 * fixed up afterwards in the editor.
 */
export function WorkGallery({
  projectId,
  renders,
  sessions,
  target,
}: {
  projectId: string;
  renders: WorkRender[];
  /** Sessions that produced at least one render, for the source filter. */
  sessions: { id: string; title: string }[];
  target: GalleryTarget | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>([]);
  const [sessionFilter, setSessionFilter] = React.useState<string>("all");
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);
  const lastClicked = React.useRef<string | null>(null);

  const visible = React.useMemo(
    () =>
      sessionFilter === "all"
        ? renders
        : renders.filter((r) => r.sessionId === sessionFilter),
    [renders, sessionFilter],
  );

  const groups = React.useMemo(() => {
    const byDay = new Map<string, { label: string; items: WorkRender[] }>();
    for (const render of visible) {
      const group = byDay.get(render.day);
      if (group) group.items.push(render);
      else byDay.set(render.day, { label: render.dayLabel, items: [render] });
    }
    return [...byDay.entries()].map(([day, group]) => ({ day, ...group }));
  }, [visible]);

  const rank = React.useMemo(() => {
    const map = new Map<string, number>();
    picked.forEach((id, i) => map.set(id, i + 1));
    return map;
  }, [picked]);

  function toggle(id: string, extend: boolean) {
    if (extend && lastClicked.current) {
      const from = visible.findIndex((r) => r.id === lastClicked.current);
      const to = visible.findIndex((r) => r.id === id);
      if (from !== -1 && to !== -1) {
        const span = visible
          .slice(Math.min(from, to), Math.max(from, to) + 1)
          .map((r) => r.id);
        setPicked((prev) => [
          ...prev,
          ...span.filter((candidate) => !prev.includes(candidate)),
        ]);
        lastClicked.current = id;
        return;
      }
    }
    lastClicked.current = id;
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  // Escape clears the selection; ⌘A takes everything currently filtered in.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && picked.length > 0) {
        setPicked([]);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "a" &&
        visible.length > 0 &&
        !(event.target instanceof HTMLInputElement)
      ) {
        event.preventDefault();
        setPicked(visible.map((r) => r.id));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked.length, visible]);

  async function save() {
    if (picked.length === 0 || saving) return;
    setSaving(true);
    try {
      if (target) {
        await addArtifactsToBundle({
          bundleId: target.id,
          artifactIds: picked,
        });
        router.push(`/work/p/${projectId}/bundles/${target.id}`);
        return;
      }
      const bundle = await createWorkBundle({
        projectId,
        name: name.trim() || "Untitled bundle",
        artifactIds: picked,
      });
      router.push(`/work/p/${projectId}/bundles/${bundle.id}`);
    } finally {
      setSaving(false);
    }
  }

  if (renders.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full border-2 border-border-soft text-fg-muted">
            <Images className="size-5" />
          </div>
          <h2 className="mt-4 font-display text-lg font-bold tracking-tight">
            Nothing rendered yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Every PNG this project renders lands here, whichever session made it.
            Start a conversation and describe a post.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b-2 border-border-soft px-5 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
          {visible.length} render{visible.length === 1 ? "" : "s"}
        </p>

        {sessions.length > 1 ? (
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            aria-label="Filter by session"
            className="h-7 rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface px-1.5 font-mono text-[11px] outline-none transition-colors focus-visible:border-ring"
          >
            <option value="all">All sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        ) : null}

        <span className="flex-1" />

        {target ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted">
            Adding to{" "}
            <Link
              href={`/work/p/${projectId}/bundles/${target.id}`}
              className="text-fg underline underline-offset-2"
            >
              {target.name}
            </Link>
          </p>
        ) : (
          <p className="font-mono text-[10px] text-fg-muted/60">
            Click to pick · shift-click for a range
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-28 pt-4">
        {groups.map((group) => (
          <section key={group.day} className="mb-7 last:mb-0">
            <h2 className="pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/60">
              {group.label}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
              {group.items.map((render) => (
                <RenderTile
                  key={render.id}
                  render={render}
                  order={rank.get(render.id) ?? null}
                  showSession={sessionFilter === "all" && sessions.length > 1}
                  onToggle={(extend) => toggle(render.id, extend)}
                  onOpen={() =>
                    setLightboxIndex(visible.findIndex((r) => r.id === render.id))
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <SelectionBar
        count={picked.length}
        target={target}
        name={name}
        onNameChange={setName}
        saving={saving}
        onSave={save}
        onClear={() => setPicked([])}
      />

      <Lightbox
        images={visible.map((r) => ({
          filename: r.filename,
          relPath: r.relPath,
        }))}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}

function RenderTile({
  render,
  order,
  showSession,
  onToggle,
  onOpen,
}: {
  render: WorkRender;
  order: number | null;
  showSession: boolean;
  onToggle: (extend: boolean) => void;
  onOpen: () => void;
}) {
  const selected = order !== null;
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-retro)] border-2 bg-surface-2 transition-colors",
        selected ? "border-primary shadow-hard-sm" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={(e) => onToggle(e.shiftKey)}
        aria-pressed={selected}
        aria-label={`Select ${render.filename}`}
        className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={render.url}
          alt={render.filename}
          loading="lazy"
          className={cn(
            "aspect-[4/5] w-full object-cover transition-opacity",
            selected && "opacity-90",
          )}
        />
      </button>

      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-2 top-2 grid size-6 place-items-center rounded-full border-2 border-border font-mono text-[10px] font-bold",
          `transition-[opacity,transform] ${MOTION_FAST} motion-reduce:transition-none`,
          selected
            ? "scale-100 bg-primary text-primary-fg opacity-100"
            : "scale-90 bg-surface text-fg-muted opacity-0 group-hover:opacity-100",
        )}
      >
        {selected ? order : <Check className="size-3" strokeWidth={3} />}
      </span>

      <button
        type="button"
        onClick={onOpen}
        title="Open full size"
        aria-label={`Open ${render.filename}`}
        className="absolute right-2 top-2 hidden size-6 place-items-center rounded-[3px] border-2 border-border bg-surface text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95 group-hover:grid"
      >
        <Maximize2 className="size-3" />
      </button>

      <div className="border-t-2 border-border bg-surface px-2 py-1.5">
        <p className="truncate font-mono text-[10px] text-fg">
          {render.filename}
        </p>
        <p className="mt-0.5 truncate font-mono text-[9px] text-fg-muted/80">
          {[render.sizeLabel, render.weightLabel].filter(Boolean).join(" · ") ||
            "size unknown"}
        </p>
        {showSession ? (
          <p className="mt-0.5 truncate font-mono text-[9px] text-fg-muted/60">
            {render.sessionTitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Slides up from the bottom once anything is picked. Naming a bundle does not
 * warrant a modal, so the field lives right here beside the count.
 */
function SelectionBar({
  count,
  target,
  name,
  onNameChange,
  saving,
  onSave,
  onClear,
}: {
  count: number;
  target: GalleryTarget | null;
  name: string;
  onNameChange: (value: string) => void;
  saving: boolean;
  onSave: () => void;
  onClear: () => void;
}) {
  const open = count > 0;
  return (
    <div
      aria-hidden={!open}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-5 pb-5",
        `transition-transform ${MOTION} motion-reduce:transition-none`,
        open ? "translate-y-0" : "translate-y-[calc(100%+1.25rem)]",
      )}
    >
      <div className="retro-card pointer-events-auto flex flex-wrap items-center gap-3 px-3 py-2.5 shadow-hard-lg">
        <span className="font-mono text-xs font-semibold tabular-nums">
          {count} selected
        </span>
        {count > CAROUSEL_LIMIT ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-danger">
            over Instagram&apos;s {CAROUSEL_LIMIT}
          </span>
        ) : null}

        <span className="h-5 w-0.5 bg-border-soft" />

        {target ? (
          <span className="max-w-[16rem] truncate font-mono text-xs text-fg-muted">
            → {target.name}
          </span>
        ) : (
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
            }}
            placeholder="Bundle name"
            aria-label="Bundle name"
            className="h-8 w-48 rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface px-2 text-xs outline-none transition-colors placeholder:text-fg-muted/60 focus-visible:border-ring"
          />
        )}

        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Layers className="size-4" />
          )}
          {target ? "Add to bundle" : "Save as bundle"}
        </Button>

        <button
          type="button"
          onClick={onClear}
          title="Clear selection"
          aria-label="Clear selection"
          className="grid size-7 place-items-center rounded-[var(--radius-retro)] text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
