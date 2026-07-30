"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { WorkConversation } from "@/components/work/work-conversation";
import { WorkCanvas } from "@/components/work/work-canvas";
import { useWorkStream } from "@/components/work/use-work-stream";
import { eventToMessage, planFromEvents, timeLabel } from "@/lib/work-events";
import { mediaUrl } from "@/lib/media";
import { deleteAsset } from "@/lib/actions/asset-actions";
import { stopRun } from "@/lib/actions/task-actions";
import {
  ensureSessionAssetFolder,
  listMentionCandidates,
  listSkillCandidates,
  sendWorkMessage,
  updateWorkSession,
} from "@/lib/actions/work-actions";
import type { ResearchMode } from "@/lib/research";
import type { WorkSessionDetail } from "@/lib/work-queries";
import type {
  WorkAttachment,
  WorkBundleSummary,
  WorkMention,
  WorkMessage,
  WorkResult,
} from "@/lib/work-types";

interface UploadedAsset {
  id: string;
  filename: string;
  relPath: string;
}

/**
 * One open session: the conversation column and the canvas beside it. Mounted
 * with the session id as its key, so switching sessions resets everything local
 * (optimistic messages, the live stream, in-flight uploads) for free.
 */
export function WorkSessionView({
  detail,
  projectId,
  projectName,
  bundles,
  hasProjects,
  railHidden,
  canvasHidden,
  onShowRail,
  onShowCanvas,
  onHideCanvas,
  onNewProject,
  onNewSession,
  researchAvailable,
}: {
  detail: WorkSessionDetail | null;
  /** Scope for the canvas's "Add to bundle" action. */
  projectId: string | null;
  projectName: string;
  bundles: WorkBundleSummary[];
  hasProjects: boolean;
  railHidden: boolean;
  canvasHidden: boolean;
  onShowRail: () => void;
  onShowCanvas: () => void;
  onHideCanvas: () => void;
  onNewProject: () => void;
  onNewSession: () => void;
  /** False when no Tavily key is saved — the composer hides the picker. */
  researchAvailable: boolean;
}) {
  const router = useRouter();
  const sessionId = detail?.id ?? null;

  const [runId, setRunId] = React.useState<string | null>(
    detail?.liveRunId ?? null,
  );
  const [pending, setPending] = React.useState<WorkMessage[]>([]);
  const [uploads, setUploads] = React.useState<WorkAttachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [model, setModel] = React.useState(detail?.model ?? "opus");
  const [aspectRatio, setAspectRatio] = React.useState<string | null>(
    detail?.aspectRatio ?? null,
  );
  // Per-message, but it opens on whatever the last turn used so a session that
  // is doing research keeps doing it without re-picking every time.
  const [researchMode, setResearchMode] = React.useState<ResearchMode>(
    detail?.researchMode ?? "AUTO",
  );

  const stream = useWorkStream(runId);

  // A finished turn is the moment the server has the whole truth — pull it in
  // and let the id-keyed merge below drop the local copies.
  React.useEffect(() => {
    if (!stream.status || stream.status === "QUEUED" || stream.status === "RUNNING") {
      return;
    }
    router.refresh();
  }, [stream.status, router]);

  const messages = React.useMemo(() => {
    const merged = new Map<string, WorkMessage>();
    for (const m of detail?.messages ?? []) merged.set(m.id, m);
    for (const m of pending) if (!merged.has(m.id)) merged.set(m.id, m);
    if (runId) {
      const last = stream.events[stream.events.length - 1];
      for (const event of stream.events) {
        const row = eventToMessage(runId, event, {
          live: event === last && stream.status === "RUNNING",
        });
        if (row) merged.set(row.id, row);
      }
    }
    return [...merged.values()];
  }, [detail?.messages, pending, runId, stream.events, stream.status]);

  const attachments = React.useMemo(() => {
    const merged = new Map<string, WorkAttachment>();
    for (const a of detail?.attachments ?? []) merged.set(a.id, a);
    for (const a of uploads) merged.set(a.id, a);
    return [...merged.values()];
  }, [detail?.attachments, uploads]);

  const results = React.useMemo(() => {
    const merged = new Map<string, WorkResult>();
    for (const r of detail?.results ?? []) merged.set(r.relPath, r);
    for (const r of stream.artifacts) {
      // Events recorded before the artifact id travelled fall back to relPath;
      // keep the real id from the persisted row when we already have it.
      const known = merged.get(r.relPath);
      merged.set(r.relPath, {
        ...r,
        id: r.id === r.relPath && known ? known.id : r.id,
      });
    }
    return [...merged.values()];
  }, [detail?.results, stream.artifacts]);

  const plan = React.useMemo(() => {
    const live = planFromEvents(stream.events);
    return live.length > 0 ? live : (detail?.plan ?? []);
  }, [stream.events, detail?.plan]);

  const busy =
    Boolean(runId) &&
    (stream.status === null ||
      stream.status === "QUEUED" ||
      stream.status === "RUNNING");

  async function attach(files: File[]) {
    if (!sessionId || files.length === 0) return;
    setUploading(true);
    try {
      const folder = await ensureSessionAssetFolder(sessionId);
      const form = new FormData();
      form.append("folderId", folder.id);
      let next = attachments.length;
      for (const file of files) {
        next += 1;
        const ext = file.type.split("/")[1] || "png";
        // Rename on the way in so the mention handle is predictable.
        form.append("files", file, `image-${next}.${ext}`);
      }
      const res = await fetch("/api/assets/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) return;
      const body = (await res.json()) as { assets?: UploadedAsset[] };
      setUploads((prev) => [
        ...prev,
        ...(body.assets ?? []).map((a) => ({
          id: a.id,
          name: a.filename,
          relPath: a.relPath,
          url: mediaUrl(a.relPath),
          origin: "session" as const,
        })),
      ]);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(id: string) {
    setUploads((prev) => prev.filter((a) => a.id !== id));
    await deleteAsset(id);
    router.refresh();
  }

  async function submit(
    text: string,
    mentions: WorkMention[],
    research: ResearchMode,
  ) {
    if (!sessionId || busy) return;
    const res = await sendWorkMessage({
      sessionId,
      text,
      mentions,
      researchMode: research,
    });
    setPending((prev) => [
      ...prev,
      {
        id: res.messageId,
        role: "user",
        timeLabel: timeLabel(new Date().toISOString()),
        text,
        mentions,
        runId: res.runId,
      },
    ]);
    setRunId(res.runId);
  }

  async function stop() {
    if (!runId) return;
    await stopRun(runId);
  }

  // Stable identity: the composer debounces on this, and a fresh closure on
  // every streamed event would keep restarting the timer mid-run.
  const searchMentions = React.useCallback(
    (query: string) =>
      sessionId ? listMentionCandidates(sessionId, query) : Promise.resolve([]),
    [sessionId],
  );

  const searchSkills = React.useCallback(
    (query: string) =>
      sessionId ? listSkillCandidates(sessionId, query) : Promise.resolve([]),
    [sessionId],
  );

  async function changeModel(next: string) {
    setModel(next);
    if (!sessionId) return;
    await updateWorkSession({ id: sessionId, model: next });
  }

  async function changeAspectRatio(next: string | null) {
    setAspectRatio(next);
    if (!sessionId) return;
    await updateWorkSession({ id: sessionId, aspectRatio: next });
  }

  return (
    <>
      <WorkConversation
        sessionId={sessionId}
        title={detail?.title ?? null}
        projectName={projectName}
        hasProjects={hasProjects}
        messages={messages}
        model={model}
        onModelChange={changeModel}
        attachments={attachments}
        uploading={uploading}
        onAttach={attach}
        onRemoveAttachment={removeAttachment}
        onSearchMentions={searchMentions}
        onSearchSkills={searchSkills}
        onSubmit={submit}
        onStop={stop}
        busy={busy}
        aspectRatio={aspectRatio}
        onAspectRatioChange={changeAspectRatio}
        researchMode={researchMode}
        onResearchModeChange={setResearchMode}
        researchAvailable={researchAvailable}
        railHidden={railHidden}
        canvasHidden={canvasHidden}
        onShowRail={onShowRail}
        onShowCanvas={onShowCanvas}
        onNewProject={onNewProject}
        onNewSession={onNewSession}
      />

      {canvasHidden || !sessionId ? null : (
        <WorkCanvas
          plan={plan}
          results={results}
          projectId={projectId}
          bundles={bundles}
          sessionTitle={detail?.title ?? ""}
          onCollapse={onHideCanvas}
        />
      )}
    </>
  );
}
