"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, LoaderCircle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Textarea } from "@/components/ui/ui-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/ui-dialog";
import { AssetTagsInput } from "@/components/asset/asset-tags-input";
import { mediaUrl } from "@/lib/media";
import {
  generateAssetCaptions,
  saveAssetCaption,
} from "@/lib/actions/asset-actions";

interface AssetLite {
  id: string;
  filename: string;
  relPath: string;
  description: string;
}

interface Row {
  id: string;
  filename: string;
  relPath: string;
  description: string;
  tags: string[];
  error?: string;
  include: boolean;
}

/**
 * Bulk auto-caption for a folder. Captions every asset missing a description via
 * Claude (Haiku, on the shared queue), then shows an editable review sheet — the
 * user confirms per row before anything is saved.
 */
export function BulkCaptionDialog({ assets }: { assets: AssetLite[] }) {
  const router = useRouter();
  const missing = React.useMemo(
    () => assets.filter((a) => !a.description.trim()),
    [assets],
  );

  const [open, setOpen] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [saving, setSaving] = React.useState(false);

  async function start() {
    setOpen(true);
    setGenerating(true);
    setRows([]);
    const missingById = new Map(missing.map((a) => [a.id, a]));
    const suggestions = await generateAssetCaptions({
      ids: missing.map((a) => a.id),
    });
    setRows(
      suggestions.map((s) => {
        const a = missingById.get(s.id)!;
        return {
          id: s.id,
          filename: a.filename,
          relPath: a.relPath,
          description: s.description,
          tags: s.tags,
          error: s.error,
          include: !s.error,
        };
      }),
    );
    setGenerating(false);
  }

  function patch(id: string, next: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }

  async function saveSelected() {
    const selected = rows.filter((r) => r.include && !r.error);
    if (selected.length === 0) {
      setOpen(false);
      return;
    }
    setSaving(true);
    for (const r of selected) {
      await saveAssetCaption({
        id: r.id,
        description: r.description,
        tags: r.tags,
      });
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  const selectedCount = rows.filter((r) => r.include && !r.error).length;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={start}
        disabled={missing.length === 0}
        title={
          missing.length === 0
            ? "Every asset already has a description"
            : undefined
        }
      >
        <Sparkles className="size-4" />
        Auto-caption {missing.length > 0 ? `(${missing.length})` : "all"}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review captions</DialogTitle>
            <DialogDescription>
              Claude drafted these from each photo. Edit anything, then save the
              ones you want — nothing is written until you do.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="max-h-[60vh] overflow-y-auto">
            {generating ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-muted">
                <LoaderCircle className="size-4 animate-spin" />
                Captioning {missing.length} image
                {missing.length === 1 ? "" : "s"}…
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="flex gap-3 rounded-[var(--radius-retro)] border-2 border-border p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(r.relPath)}
                      alt={r.filename}
                      className="size-16 shrink-0 rounded-[4px] border-2 border-border object-cover"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-mono text-fg-muted">
                          {r.filename}
                        </span>
                        {r.error ? (
                          <span className="shrink-0 text-[10px] font-mono text-danger">
                            {r.error}
                          </span>
                        ) : (
                          <label className="flex shrink-0 items-center gap-1 text-[10px] font-mono text-fg-muted">
                            <input
                              type="checkbox"
                              checked={r.include}
                              onChange={(e) =>
                                patch(r.id, { include: e.target.checked })
                              }
                            />
                            include
                          </label>
                        )}
                      </div>
                      {!r.error && (
                        <>
                          <Textarea
                            value={r.description}
                            onChange={(e) =>
                              patch(r.id, { description: e.target.value })
                            }
                            className="min-h-12 text-xs"
                          />
                          <AssetTagsInput
                            value={r.tags}
                            onChange={(tags) => patch(r.id, { tags })}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              variant="surface"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              <X className="size-4" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveSelected}
              disabled={generating || saving || selectedCount === 0}
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save {selectedCount > 0 ? selectedCount : ""} selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
