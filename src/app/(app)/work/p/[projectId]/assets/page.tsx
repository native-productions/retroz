import { notFound } from "next/navigation";
import { Images, Sparkles } from "lucide-react";
import { db } from "@/lib/db-client";
import { WorkProjectBar } from "@/components/work/work-project-bar";
import { AssetCard } from "@/components/asset/asset-card";
import { AssetSourceDialog } from "@/components/asset/asset-source-dialog";
import { BulkCaptionDialog } from "@/components/asset/bulk-caption-dialog";
import { GlobalAssetsSection } from "@/components/asset/global-assets-section";
import { ensureProjectAssetFolderRow } from "@/lib/project-assets";
import { isPexelsConfigured } from "@/lib/pexels";
import { listWorkProjects, listWorkflowOptions } from "@/lib/work-queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assets — Retroz" };

/**
 * The project's image library: what the agent searches when a slide needs a
 * picture. Descriptions are the point — "use this when you need the Claude
 * logo" is what `search_assets` matches a brief against, so the copy pushes
 * toward writing them.
 */
export default async function WorkAssetsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [projects, workflows] = await Promise.all([
    listWorkProjects(),
    listWorkflowOptions(),
  ]);
  if (!projects.some((p) => p.id === projectId)) notFound();

  const project = await db.workProject.findUniqueOrThrow({
    where: { id: projectId },
    select: { workflowId: true },
  });

  // Created on first visit so the tab is never a dead end.
  const folder = await ensureProjectAssetFolderRow(projectId);
  const [assets, pexelsEnabled] = await Promise.all([
    db.asset.findMany({
      where: { folderId: folder.id },
      orderBy: { createdAt: "desc" },
    }),
    isPexelsConfigured(),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkProjectBar
        projects={projects}
        activeProjectId={projectId}
        tab="assets"
        workflows={workflows}
      />

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-6">
          <GlobalAssetsSection workflowId={project.workflowId} />

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display font-semibold leading-tight">
                  Project assets
                </h2>
                <p className="max-w-[42rem] text-xs leading-relaxed text-fg-muted">
                  What the agent reaches for on every turn in this project.
                  Describe each one by when to use it, not by what it is — “use
                  this when you need the Claude logo” beats “claude logo png”,
                  because that sentence is what gets matched against the brief.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-xs text-fg-muted">
                  {assets.length} asset{assets.length === 1 ? "" : "s"}
                </span>
                {assets.length > 0 ? (
                  <BulkCaptionDialog
                    assets={assets.map((a) => ({
                      id: a.id,
                      filename: a.filename,
                      relPath: a.relPath,
                      description: a.description,
                    }))}
                  />
                ) : null}
                <AssetSourceDialog
                  scope={{ folderId: folder.id }}
                  pexelsEnabled={pexelsEnabled}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  allowSvg
                  triggerLabel="Add assets"
                />
              </div>
            </div>

            {assets.length === 0 ? (
              <div className="rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft px-4 py-12 text-center">
                <div className="mx-auto grid size-10 place-items-center rounded-full border-2 border-border-soft text-fg-muted">
                  <Images className="size-4" />
                </div>
                <p className="mt-3 text-sm font-semibold">
                  The library is empty
                </p>
                <p className="mx-auto mt-1 max-w-[26rem] text-xs leading-relaxed text-fg-muted">
                  Add the marks and photos this project keeps reaching for.
                  Anything the agent pulls from Wikimedia or Pexels mid-run lands
                  here too, so the library fills itself as you work.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {assets.map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={{
                      id: a.id,
                      filename: a.filename,
                      relPath: a.relPath,
                      width: a.width,
                      height: a.height,
                      description: a.description,
                      tags: a.tags,
                      autoDescribed: a.autoDescribed,
                      sourceRef: a.sourceRef,
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <p className="flex items-start gap-2 rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface-2/40 px-3 py-2.5 text-xs leading-relaxed text-fg-muted">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span>
              When nothing here fits, the agent searches Wikimedia Commons and
              Pexels itself and imports what it picks — those arrive tagged with
              their source. It only looks when a slide actually needs a photo;
              quote cards and stat slides stay typographic.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
