"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, LoaderCircle, X, Plus, ImageIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media";
import { useConfirm } from "@/components/confirm-provider";
import { AssetSourceDialog } from "@/components/asset/asset-source-dialog";
import { setAssetRequestFulfilled } from "@/lib/actions/campaign-actions";
import { deleteAsset } from "@/lib/actions/asset-actions";

interface Request {
  id: string;
  label: string;
  description: string;
  count: number;
  fulfilled: boolean;
}

interface AssetPreview {
  id: string;
  filename: string;
  relPath: string;
  description: string;
}

/** Uploads seed an asset's description with the request label ("{label}, …"),
 *  so we surface those photos under their originating card. */
function matchAssets(req: Request, assets: AssetPreview[]): AssetPreview[] {
  const label = req.label.trim().toLowerCase();
  if (!label) return [];
  return assets.filter((a) => {
    const d = a.description.trim().toLowerCase();
    return d === label || d.startsWith(`${label},`);
  });
}

export function CampaignAssetChecklist({
  folderId,
  requests,
  assets = [],
  pexelsEnabled = false,
}: {
  folderId: string | null;
  requests: Request[];
  assets?: AssetPreview[];
  pexelsEnabled?: boolean;
}) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  async function removeAsset(asset: AssetPreview) {
    const ok = await askConfirm({
      title: "Delete this photo?",
      description: `"${asset.filename}" will be removed. Add another to replace it.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(asset.id);
    try {
      await deleteAsset(asset.id);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  // Seed each Asset's description from the planner's request ("{label}, {desc}")
  // so imported photos surface back under this request.
  function seedDescription(r: Request): string {
    return r.description ? `${r.label}, ${r.description}` : r.label;
  }

  if (requests.length === 0) {
    return (
      <p className="font-mono text-sm text-fg-muted">
        No photo requests. The planner lists needed photos here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {requests.map((r) => {
        const matched = matchAssets(r, assets);
        const met = matched.length >= r.count;
        return (
          <section key={r.id} className="flex flex-col gap-3">
            {/* Request header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setAssetRequestFulfilled(r.id, !r.fulfilled).then(() =>
                      router.refresh(),
                    )
                  }
                  className="shrink-0"
                  title={r.fulfilled ? "Mark not done" : "Mark done"}
                >
                  {r.fulfilled ? (
                    <Check className="size-5 text-primary" />
                  ) : (
                    <Circle className="size-5 text-fg-muted" />
                  )}
                </button>
                <div className="min-w-0">
                  <p className="truncate font-display font-semibold">
                    {r.label}
                  </p>
                  {r.description ? (
                    <p className="truncate text-xs text-fg-muted">
                      {r.description}
                    </p>
                  ) : null}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                  met
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border-soft text-fg-muted",
                )}
              >
                {matched.length}/{r.count}
              </span>
            </div>

            {/* Gallery grid */}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {folderId ? (
                <AssetSourceDialog
                  scope={{ folderId }}
                  description={seedDescription(r)}
                  pexelsEnabled={pexelsEnabled}
                  pexelsQuery={r.label}
                  title={`Add photos — ${r.label}`}
                  onImported={() =>
                    setAssetRequestFulfilled(r.id, true).then(() =>
                      router.refresh(),
                    )
                  }
                  trigger={
                    <button
                      type="button"
                      className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft bg-surface-2/40 text-fg-muted outline-none transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="size-6 transition-transform group-hover:scale-110" />
                      <span className="font-mono text-[10px] uppercase tracking-wide">
                        Add
                      </span>
                    </button>
                  }
                />
              ) : null}

              {matched.map((a) => (
                <div key={a.id} className="group relative aspect-square">
                  <a
                    href={mediaUrl(a.relPath)}
                    target="_blank"
                    rel="noreferrer"
                    title={a.filename}
                    className="block size-full overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-surface shadow-hard-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(a.relPath)}
                      alt={a.filename}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </a>
                  <button
                    type="button"
                    onClick={() => removeAsset(a)}
                    disabled={deletingId === a.id}
                    title="Delete photo"
                    className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full border-2 border-border bg-surface/90 text-danger shadow-hard-sm backdrop-blur-sm transition-opacity hover:bg-danger hover:text-white disabled:pointer-events-none disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    {deletingId === a.id ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                  </button>
                </div>
              ))}

              {matched.length === 0 && !folderId ? (
                <div className="col-span-full flex items-center gap-2 rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft p-4 font-mono text-xs text-fg-muted">
                  <ImageIcon className="size-4" /> No photos yet.
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
