"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useImagePaste } from "@/lib/use-image-paste";

export function GlobalAssetUploader({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useImagePaste((files) => upload(files));

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type === "image/svg+xml",
    );
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("workflowId", workflowId);
    list.forEach((f) => form.append("files", f));
    try {
      const res = await fetch("/api/assets/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      setError("Upload failed. PNG / JPG / WebP / SVG only.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={cn(
          "grid place-items-center gap-1.5 rounded-[var(--radius-retro)] border-2 border-dashed p-6 text-center cursor-pointer transition-colors outline-none",
          dragging
            ? "border-primary bg-primary/10"
            : "border-border-soft hover:border-border bg-surface-2/40",
        )}
      >
        {uploading ? (
          <LoaderCircle className="size-5 animate-spin text-secondary" />
        ) : (
          <UploadCloud className="size-5 text-secondary" />
        )}
        <p className="text-sm font-medium">
          {uploading ? "Uploading…" : "Drop, click, or paste a global asset"}
        </p>
        <p className="text-xs text-fg-muted font-mono">
          backgrounds · logos · SVG · ⌘/Ctrl+V
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
