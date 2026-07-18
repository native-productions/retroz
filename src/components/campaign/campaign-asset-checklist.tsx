"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, LoaderCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media";
import { Card } from "@/components/ui/ui-card";
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
      description: `"${asset.filename}" will be removed. Upload another to replace it.`,
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
  // so imported photos surface back under this card.
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
              {folderId ? (
                <AssetSourceDialog
                  scope={{ folderId }}
                  description={seedDescription(r)}
                  pexelsEnabled={pexelsEnabled}
                  pexelsQuery={r.label}
                  triggerLabel="Add"
                  triggerVariant="outline"
                  triggerSize="sm"
                  title={`Add photos — ${r.label}`}
                  onImported={() =>
                    setAssetRequestFulfilled(r.id, true).then(() =>
                      router.refresh(),
                    )
                  }
                />
              ) : null}
            </div>
          </div>
          {(() => {
            const matched = matchAssets(r, assets);
            if (matched.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2 pl-6 pt-1">
                {matched.map((a) => (
                  <div key={a.id} className="group relative size-16">
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
                        className="size-full object-cover"
                      />
                    </a>
                    <button
                      type="button"
                      onClick={() => removeAsset(a)}
                      disabled={deletingId === a.id}
                      title="Delete photo"
                      className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full border-2 border-border bg-surface text-danger shadow-hard-sm transition-opacity hover:bg-danger hover:text-white disabled:pointer-events-none disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      {deletingId === a.id ? (
                        <LoaderCircle className="size-3 animate-spin" />
                      ) : (
                        <X className="size-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </Card>
      ))}
    </div>
  );
}
