"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, ClipboardPaste, Check, Circle, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/ui-card";
import { setAssetRequestFulfilled } from "@/lib/actions/campaign-actions";

interface Request {
  id: string;
  label: string;
  description: string;
  count: number;
  fulfilled: boolean;
}

export function CampaignAssetChecklist({
  folderId,
  requests,
}: {
  folderId: string | null;
  requests: Request[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<{ id: string; text: string } | null>(
    null,
  );

  async function uploadFiles(reqId: string, files: File[]) {
    if (files.length === 0 || !folderId) return;
    const req = requests.find((r) => r.id === reqId);
    // Seed the asset description from the planner's request: "{label}, {description}".
    const description = req
      ? req.description
        ? `${req.label}, ${req.description}`
        : req.label
      : "";
    setBusyId(reqId);
    setNote(null);
    try {
      const form = new FormData();
      form.set("folderId", folderId);
      if (description) form.set("description", description);
      for (const f of files) form.append("files", f);
      await fetch("/api/assets/upload", { method: "POST", body: form });
      await setAssetRequestFulfilled(reqId, true);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function pasteImage(reqId: string) {
    if (!folderId) return;
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const ext = type.split("/")[1] || "png";
        files.push(
          new File([blob], `pasted-${Date.now()}.${ext}`, { type }),
        );
      }
      if (files.length === 0) {
        setNote({ id: reqId, text: "No image found in the clipboard." });
        return;
      }
      await uploadFiles(reqId, files);
    } catch {
      setNote({
        id: reqId,
        text: "Clipboard access denied. Copy an image, then allow paste.",
      });
    }
  }

  if (requests.length === 0) {
    return (
      <p className="font-mono text-sm text-fg-muted">
        No photo requests. The planner lists needed photos here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {requests.map((r) => (
        <Card
          key={r.id}
          className={cn(
            "flex flex-col gap-1 p-3",
            r.fulfilled && "opacity-70",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <button
                type="button"
                onClick={() =>
                  setAssetRequestFulfilled(r.id, !r.fulfilled).then(() =>
                    router.refresh(),
                  )
                }
                className="mt-0.5 shrink-0"
                title={r.fulfilled ? "Mark not done" : "Mark done"}
              >
                {r.fulfilled ? (
                  <Check className="size-4 text-primary" />
                ) : (
                  <Circle className="size-4 text-fg-muted" />
                )}
              </button>
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold">
                  {r.label}
                  <span className="ml-1.5 font-mono text-[10px] text-fg-muted">
                    ×{r.count}
                  </span>
                </p>
                {r.description ? (
                  <p className="text-xs text-fg-muted">{r.description}</p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => pasteImage(r.id)}
                disabled={!folderId || busyId === r.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-retro)] border-2 border-border bg-surface px-2.5 py-1 font-mono text-xs shadow-hard-sm",
                  (!folderId || busyId === r.id) && "pointer-events-none opacity-50",
                )}
              >
                <ClipboardPaste className="size-3.5" />
                Paste
              </button>
              <label
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-retro)] border-2 border-border bg-surface px-2.5 py-1 font-mono text-xs shadow-hard-sm",
                  !folderId && "pointer-events-none opacity-50",
                )}
              >
                {busyId === r.id ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                Upload
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) =>
                    uploadFiles(r.id, Array.from(e.target.files ?? []))
                  }
                />
              </label>
            </div>
          </div>
          {note?.id === r.id ? (
            <p className="pl-6 font-mono text-[11px] text-danger">{note.text}</p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
