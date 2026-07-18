import { Globe } from "lucide-react";
import { db } from "@/lib/db-client";
import { AssetSourceDialog } from "@/components/asset/asset-source-dialog";
import { GlobalAssetCard } from "@/components/asset/global-asset-card";
import { isPexelsConfigured } from "@/lib/pexels";

export async function GlobalAssetsSection({
  workflowId,
}: {
  workflowId: string;
}) {
  const [assets, pexelsEnabled] = await Promise.all([
    db.workflowAsset.findMany({
      where: { workflowId },
      orderBy: { createdAt: "desc" },
    }),
    isPexelsConfigured(),
  ]);

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft bg-surface-2/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-retro)] border-2 border-border bg-secondary text-secondary-fg">
            <Globe className="size-4" />
          </div>
          <div>
            <h3 className="font-display font-semibold leading-tight">
              Global assets
            </h3>
            <p className="text-xs text-fg-muted">
              Reused across every task in this workflow — backgrounds, brand
              logos, SVG patterns.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs text-fg-muted">
            {assets.length} asset{assets.length === 1 ? "" : "s"}
          </span>
          <AssetSourceDialog
            scope={{ workflowId }}
            pexelsEnabled={pexelsEnabled}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            allowSvg
            triggerLabel="Add asset"
            triggerVariant="outline"
          />
        </div>
      </div>

      {assets.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((a) => (
            <GlobalAssetCard
              key={a.id}
              asset={{
                id: a.id,
                filename: a.filename,
                relPath: a.relPath,
                kind: a.kind,
                description: a.description,
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
