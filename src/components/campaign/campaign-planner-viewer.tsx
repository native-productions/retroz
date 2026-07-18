"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Terminal, Wrench, TriangleAlert, CircleCheck } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { RunStatusBadge } from "@/components/run/run-status-badge";

interface RunEvent {
  seq: number;
  type: "TEXT" | "TOOL" | "ERROR" | "SYSTEM" | "ARTIFACT" | "STATUS";
  payload: Record<string, unknown>;
  ts: string;
}

export function CampaignPlannerViewer({
  planRunId,
  initialStatus,
  initialEvents,
}: {
  planRunId: string;
  initialStatus: string;
  initialEvents: RunEvent[];
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState(initialStatus);
  const [events, setEvents] = React.useState<RunEvent[]>(initialEvents);
  const seenSeq = React.useRef(new Set(initialEvents.map((e) => e.seq)));
  const logEndRef = React.useRef<HTMLDivElement>(null);

  const isLive = status === "QUEUED" || status === "RUNNING";

  React.useEffect(() => {
    if (!isLive) return;
    const es = new EventSource(`/api/campaign-plans/${planRunId}/stream`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as RunEvent;
      if (seenSeq.current.has(event.seq)) return;
      seenSeq.current.add(event.seq);
      if (event.type === "STATUS") {
        const p = event.payload as { status?: string };
        if (p.status) setStatus(p.status);
        if (p.status && p.status !== "RUNNING") {
          es.close();
          // draft calendar was just written — reload the page data
          router.refresh();
        }
        return;
      }
      setEvents((prev) => [...prev, event]);
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [planRunId, isLive, router]);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="retro-card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-surface-2 px-4 py-2.5">
        <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide">
          <Terminal className="size-4" /> Planner activity
        </span>
        <RunStatusBadge status={status} />
      </div>
      <div className="flex max-h-[50vh] min-h-40 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {events.length === 0 ? (
          <p className="font-mono text-sm text-fg-muted">
            {isLive ? "Waiting for the planner…" : "No activity recorded."}
          </p>
        ) : (
          events.map((e) => <LogRow key={e.seq} event={e} />)
        )}
        {isLive ? (
          <p className="animate-pulse font-mono text-xs text-fg-muted">● live</p>
        ) : null}
        <div ref={logEndRef} />
      </div>
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
      <div className="inline-flex w-fit items-center gap-2 font-mono text-[11px] text-fg-muted">
        <CircleCheck className="size-3.5" />
        {JSON.stringify(event.payload)}
      </div>
    );
  }
  return null;
}
