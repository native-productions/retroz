"use client";

import * as React from "react";
import {
  Terminal,
  Wrench,
  Image as ImageIcon,
  TriangleAlert,
  CircleCheck,
  RotateCcw,
  LoaderCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/ui-button";
import { RunStatusBadge } from "@/components/run/run-status-badge";
import { Lightbox } from "@/components/run/image-lightbox";
import { triggerRun } from "@/lib/actions/task-actions";

interface RunEvent {
  seq: number;
  type: "TEXT" | "TOOL" | "ERROR" | "SYSTEM" | "ARTIFACT" | "STATUS";
  payload: Record<string, unknown>;
  ts: string;
}

interface Artifact {
  id?: string;
  filename: string;
  relPath: string;
  width: number | null;
  height: number | null;
}

/** Compact token count: 12345 → "12.3k". */
function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

interface RunMeta {
  tokensIn?: number;
  tokensOut?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  costUsd?: number;
}

export function RunViewer({
  runId,
  taskId,
  initialStatus,
  initialEvents,
  initialArtifacts,
  initialMeta,
}: {
  runId: string;
  taskId: string;
  initialStatus: string;
  initialEvents: RunEvent[];
  initialArtifacts: Artifact[];
  initialMeta?: RunMeta;
}) {
  const [retrying, startRetry] = React.useTransition();
  const [status, setStatus] = React.useState(initialStatus);
  const [events, setEvents] = React.useState<RunEvent[]>(initialEvents);
  const [artifacts, setArtifacts] = React.useState<Artifact[]>(
    initialArtifacts,
  );
  const [meta, setMeta] = React.useState<RunMeta>(initialMeta ?? {});
  const seenSeq = React.useRef(
    new Set(initialEvents.map((e) => e.seq)),
  );
  const seenArtifact = React.useRef(
    new Set(initialArtifacts.map((a) => a.relPath)),
  );
  const logEndRef = React.useRef<HTMLDivElement>(null);
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  const isLive = status === "QUEUED" || status === "RUNNING";
  const canRetry = status === "FAILED" || status === "CANCELLED";

  React.useEffect(() => {
    if (!isLive) return;
    const es = new EventSource(`/api/runs/${runId}/stream`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as RunEvent;
      if (seenSeq.current.has(event.seq)) return;
      seenSeq.current.add(event.seq);

      if (event.type === "ARTIFACT") {
        const a = event.payload as unknown as Artifact;
        if (!seenArtifact.current.has(a.relPath)) {
          seenArtifact.current.add(a.relPath);
          setArtifacts((prev) => [...prev, a]);
        }
        return;
      }
      if (event.type === "STATUS") {
        const p = event.payload as { status?: string } & RunMeta;
        if (p.status) setStatus(p.status);
        if (p.tokensIn !== undefined)
          setMeta({
            tokensIn: p.tokensIn,
            tokensOut: p.tokensOut,
            cacheCreationTokens: p.cacheCreationTokens,
            cacheReadTokens: p.cacheReadTokens,
            costUsd: p.costUsd,
          });
        if (p.status && p.status !== "RUNNING") es.close();
        return;
      }
      setEvents((prev) => [...prev, event]);
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [runId, isLive]);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* log */}
      <div className="lg:col-span-3 retro-card flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-surface-2 px-4 py-2.5">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide">
            <Terminal className="size-4" /> Activity
          </span>
          <div className="flex items-center gap-2">
            {meta.tokensOut !== undefined ? (
              <span className="font-mono text-[10px] text-fg-muted">
                {meta.tokensIn}▸{meta.tokensOut} tok
                {meta.cacheReadTokens || meta.cacheCreationTokens
                  ? ` · ${fmtK(
                      (meta.cacheReadTokens ?? 0) +
                        (meta.cacheCreationTokens ?? 0),
                    )} cache`
                  : ""}
                {meta.costUsd ? ` · $${meta.costUsd.toFixed(4)}` : ""}
              </span>
            ) : null}
            {canRetry ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={retrying}
                onClick={() => startRetry(() => triggerRun(taskId))}
              >
                {retrying ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Retry
              </Button>
            ) : null}
            <RunStatusBadge status={status} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-h-[70vh] min-h-64">
          {events.length === 0 ? (
            <p className="text-sm text-fg-muted font-mono">
              {isLive ? "Waiting for Claude…" : "No activity recorded."}
            </p>
          ) : (
            events.map((e) => <LogRow key={e.seq} event={e} />)
          )}
          {isLive ? (
            <p className="text-xs text-fg-muted font-mono animate-pulse">
              ● live
            </p>
          ) : null}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* gallery */}
      <div className="lg:col-span-2 retro-card flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-surface-2 px-4 py-2.5">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide">
            <ImageIcon className="size-4" /> Output
          </span>
          <span className="font-mono text-[10px] text-fg-muted">
            {artifacts.length} PNG
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 max-h-[70vh] min-h-64">
          {artifacts.length === 0 ? (
            <p className="text-sm text-fg-muted font-mono">
              Rendered images appear here.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {artifacts.map((a, i) => (
                <button
                  key={a.relPath}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="group flex flex-col gap-1 text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(a.relPath)}
                    alt={a.filename}
                    className="w-full rounded-[4px] border-2 border-border object-cover retro-press"
                  />
                  <span className="truncate font-mono text-[10px] text-fg-muted">
                    {a.filename}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Lightbox
        images={artifacts}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}

function LogRow({ event }: { event: RunEvent }) {
  if (event.type === "TEXT") {
    return <Markdown>{String(event.payload.text ?? "")}</Markdown>;
  }
  if (event.type === "TOOL") {
    const name = String(event.payload.name ?? "tool");
    return (
      <div className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 px-2.5 py-1 font-mono text-xs">
        <Wrench className="size-3.5 text-secondary" />
        {name.replace("mcp__retroz__", "")}
      </div>
    );
  }
  if (event.type === "ERROR") {
    return (
      <div className="inline-flex items-start gap-2 rounded-[var(--radius-retro)] border-2 border-danger/50 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span className="font-mono">{String(event.payload.message ?? "")}</span>
      </div>
    );
  }
  if (event.type === "SYSTEM") {
    return (
      <div
        className={cn(
          "inline-flex w-fit items-center gap-2 font-mono text-[11px] text-fg-muted",
        )}
      >
        <CircleCheck className="size-3.5" />
        {JSON.stringify(event.payload)}
      </div>
    );
  }
  return null;
}
