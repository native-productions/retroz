"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  PanelRightClose,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Lightbox } from "@/components/run/image-lightbox";
import {
  addArtifactsToBundle,
  createWorkBundle,
} from "@/lib/actions/work-bundle-actions";
import type {
  WorkBundleSummary,
  WorkPlanStep,
  WorkResult,
} from "@/lib/work-types";

const MOTION = "duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Right-hand panel: what the agent intends to do, and what it has produced.
 * Plan sits on top because it explains the renders below it.
 */
export function WorkCanvas({
  plan,
  results,
  projectId,
  bundles,
  sessionTitle,
  onCollapse,
}: {
  plan: WorkPlanStep[];
  results: WorkResult[];
  /** Scope for "Add to bundle". Null before a project is resolved. */
  projectId: string | null;
  bundles: WorkBundleSummary[];
  sessionTitle: string;
  onCollapse: () => void;
}) {
  const [planOpen, setPlanOpen] = React.useState(true);
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  const done = plan.filter((s) => s.status === "done").length;

  return (
    <aside className="flex h-full w-[390px] shrink-0 flex-col border-l-2 border-border bg-surface/70 backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b-2 border-border px-3.5 py-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold leading-none">Canvas</p>
          <p className="mt-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.08em] text-fg-muted">
            Plan &amp; renders
          </p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Hide canvas"
          aria-label="Hide canvas"
          className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-retro)] text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>

      <section className="border-b-2 border-border-soft">
        <button
          type="button"
          onClick={() => setPlanOpen((v) => !v)}
          aria-expanded={planOpen}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left outline-none transition-colors hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
            Plan
          </span>
          <span className="font-mono text-[10px] text-fg-muted">
            {done}/{plan.length}
          </span>
          <span className="flex-1" />
          <ChevronDown
            className={cn(
              "size-3.5 text-fg-muted",
              `transition-transform ${MOTION} motion-reduce:transition-none`,
              !planOpen && "-rotate-90",
            )}
          />
        </button>

        <div
          className={cn(
            "grid",
            `transition-[grid-template-rows] ${MOTION} motion-reduce:transition-none`,
          )}
          style={{ gridTemplateRows: planOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            {plan.length === 0 ? (
              <p className="px-3.5 pb-3.5 text-xs text-fg-muted">
                Nothing planned. Retroz keeps a checklist here for requests that
                take more than one step.
              </p>
            ) : (
              <ol className="flex flex-col px-3.5 pb-3.5">
                {plan.map((step, i) => (
                  <PlanRow
                    key={step.id}
                    step={step}
                    index={i + 1}
                    last={i === plan.length - 1}
                  />
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
          Renders
        </span>
        <span className="font-mono text-[10px] text-fg-muted">
          {results.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 pb-4">
        {results.length === 0 ? (
          <div className="rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft px-4 py-10 text-center">
            <div className="mx-auto grid size-10 place-items-center rounded-full border-2 border-border-soft text-fg-muted">
              <ImageIcon className="size-4" />
            </div>
            <p className="mt-3 text-sm font-semibold">Nothing rendered yet</p>
            <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-relaxed text-fg-muted">
              Describe a post in the conversation. Every PNG Retroz renders shows
              up here, newest last.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {results.map((result, i) => (
              <div
                key={result.id}
                className="group relative overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 shadow-hard-sm"
              >
                <button
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`Open ${result.filename}`}
                  className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.url}
                    alt={result.filename}
                    className="aspect-[4/5] w-full object-cover"
                  />
                </button>
                {projectId ? (
                  <BundleMenu
                    projectId={projectId}
                    bundles={bundles}
                    artifactId={result.id}
                    sessionTitle={sessionTitle}
                  />
                ) : null}
                <span className="block truncate border-t-2 border-border bg-surface px-2 py-1.5 font-mono text-[10px] text-fg-muted">
                  {result.filename}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Lightbox
        images={results.map((r) => ({
          filename: r.filename,
          relPath: r.relPath,
        }))}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </aside>
  );
}

/**
 * Collects a render into a carousel without leaving the conversation. "New
 * bundle" borrows the session title and opens the editor, where the name is
 * inline-editable — cheaper than asking for one inside a dropdown.
 */
function BundleMenu({
  projectId,
  bundles,
  artifactId,
  sessionTitle,
}: {
  projectId: string;
  bundles: WorkBundleSummary[];
  artifactId: string;
  sessionTitle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function addTo(bundleId: string) {
    setBusy(true);
    try {
      await addArtifactsToBundle({ bundleId, artifactIds: [artifactId] });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createWith() {
    setBusy(true);
    try {
      const bundle = await createWorkBundle({
        projectId,
        name: sessionTitle || "Untitled bundle",
        artifactIds: [artifactId],
      });
      router.push(`/work/p/${projectId}/bundles/${bundle.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={busy}
          title="Add to bundle"
          aria-label="Add to bundle"
          className="absolute right-1.5 top-1.5 hidden size-6 place-items-center rounded-[3px] border-2 border-border bg-surface text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95 group-hover:grid data-[state=open]:grid"
        >
          {busy ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : (
            <Layers className="size-3" />
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="retro-card z-50 min-w-[12rem] p-1 shadow-hard-lg"
        >
          <DropdownMenu.Label className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted/70">
            Add to bundle
          </DropdownMenu.Label>
          {bundles.map((bundle) => (
            <DropdownMenu.Item
              key={bundle.id}
              onSelect={() => addTo(bundle.id)}
              className="flex cursor-pointer select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-sm text-fg-muted outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-fg"
            >
              <span className="min-w-0 flex-1 truncate">{bundle.name}</span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-70">
                {bundle.count}
              </span>
            </DropdownMenu.Item>
          ))}
          {bundles.length > 0 ? (
            <DropdownMenu.Separator className="my-1 h-0.5 bg-border-soft" />
          ) : null}
          <DropdownMenu.Item
            onSelect={createWith}
            className="flex cursor-pointer select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-sm text-fg-muted outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-fg"
          >
            <Plus className="size-3.5 shrink-0" />
            New bundle
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function PlanRow({
  step,
  index,
  last,
}: {
  step: WorkPlanStep;
  index: number;
  last: boolean;
}) {
  return (
    <li className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full border-2 font-mono text-[9px] font-bold",
            step.status === "done" && "border-border bg-primary text-primary-fg",
            step.status === "running" && "border-border bg-accent text-accent-fg",
            step.status === "pending" && "border-border-soft text-fg-muted/70",
            step.status === "blocked" && "border-danger text-danger",
          )}
        >
          {step.status === "done" ? (
            <Check className="size-3" strokeWidth={3} />
          ) : step.status === "running" ? (
            <LoaderCircle className="size-3 animate-spin" strokeWidth={3} />
          ) : step.status === "blocked" ? (
            <TriangleAlert className="size-3" strokeWidth={3} />
          ) : (
            index
          )}
        </span>
        {last ? null : (
          <span className="my-0.5 w-0.5 flex-1 rounded-full bg-border-soft" />
        )}
      </div>

      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-3")}>
        <p
          className={cn(
            "text-[13px] leading-5",
            step.status === "pending" ? "text-fg-muted" : "text-fg",
            step.status === "running" && "font-semibold",
          )}
        >
          {step.label}
        </p>
        {step.detail ? (
          <p className="mt-0.5 truncate font-mono text-[10px] text-fg-muted/80">
            {step.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}
