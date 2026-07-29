"use client";

import * as React from "react";
import { mediaUrl } from "@/lib/media";
import type { WorkEvent } from "@/lib/work-events";
import type { WorkResult } from "@/lib/work-types";

export type WorkRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "DONE"
  | "FAILED"
  | "CANCELLED";

interface ArtifactPayload {
  /** RunArtifact id. Absent on events recorded before it was carried. */
  id?: string;
  filename: string;
  relPath: string;
  width: number | null;
  height: number | null;
}

/**
 * Live tap on one Work turn. Reuses the run viewer's stream contract: the route
 * replays the run's persisted events first, then pushes new ones, so a viewer
 * that joins late still sees the whole turn.
 */
export function useWorkStream(runId: string | null) {
  const [events, setEvents] = React.useState<WorkEvent[]>([]);
  const [artifacts, setArtifacts] = React.useState<WorkResult[]>([]);
  const [status, setStatus] = React.useState<WorkRunStatus | null>(null);

  React.useEffect(() => {
    setEvents([]);
    setArtifacts([]);
    setStatus(null);
    if (!runId) return;

    const seen = new Set<number>();
    const source = new EventSource(`/api/runs/${runId}/stream`);

    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as WorkEvent;
      if (seen.has(event.seq)) return;
      seen.add(event.seq);

      if (event.type === "ARTIFACT") {
        const a = event.payload as unknown as ArtifactPayload;
        setArtifacts((prev) => [
          ...prev.filter((p) => p.relPath !== a.relPath),
          {
            id: a.id ?? a.relPath,
            filename: a.filename,
            relPath: a.relPath,
            url: mediaUrl(a.relPath),
            sizeLabel: a.width && a.height ? `${a.width} × ${a.height}` : "",
          },
        ]);
        return;
      }

      if (event.type === "STATUS") {
        const next = (event.payload as { status?: WorkRunStatus }).status;
        if (next) setStatus(next);
        if (next && next !== "RUNNING") source.close();
        return;
      }

      setEvents((prev) => [...prev, event]);
    };

    source.onerror = () => source.close();
    return () => source.close();
  }, [runId]);

  return { events, artifacts, status };
}
