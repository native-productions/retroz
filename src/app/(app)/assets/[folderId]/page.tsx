import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db-client";
import { PageHeader, PageBody } from "@/components/page-header";
import { Badge } from "@/components/ui/ui-badge";
import { ActionButton } from "@/components/ui/ui-action-button";
import { AssetUploader } from "@/components/asset/asset-uploader";
import { AssetCard } from "@/components/asset/asset-card";
import { BulkCaptionDialog } from "@/components/asset/bulk-caption-dialog";
import { FolderRenameDialog } from "@/components/asset/folder-rename-dialog";
import { deleteFolder } from "@/lib/actions/asset-actions";

export const dynamic = "force-dynamic";

export default async function AssetFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  const folder = await db.assetFolder.findUnique({
    where: { id: folderId },
    include: {
      workflow: true,
      assets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!folder) notFound();

  return (
    <>
      <PageHeader
        title={folder.name}
        description={folder.notes ?? undefined}
        breadcrumb={[
          { label: "Workflows", href: "/workflows" },
          {
            label: folder.workflow.name,
            href: `/workflows/${folder.workflowId}`,
          },
          { label: folder.name },
        ]}
      >
        <FolderRenameDialog
          folderId={folder.id}
          name={folder.name}
          notes={folder.notes ?? undefined}
        />
        <Badge tone="surface">{folder.assets.length} assets</Badge>
      </PageHeader>

      <PageBody className="flex flex-col gap-5">
        <AssetUploader folderId={folder.id} />

        {folder.assets.length > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-fg-muted">
              Describe assets so Claude can pick the right ones — or let it draft
              descriptions and tags for you.
            </p>
            <BulkCaptionDialog
              assets={folder.assets.map((a) => ({
                id: a.id,
                filename: a.filename,
                relPath: a.relPath,
                description: a.description,
              }))}
            />
          </div>
        ) : null}

        {folder.assets.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folder.assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={{
                  id: asset.id,
                  filename: asset.filename,
                  relPath: asset.relPath,
                  width: asset.width,
                  height: asset.height,
                  description: asset.description,
                  tags: asset.tags,
                  autoDescribed: asset.autoDescribed,
                }}
              />
            ))}
          </div>
        ) : null}

        <section className="flex items-center justify-between gap-3 border-t-2 border-border pt-5">
          <div>
            <p className="font-display text-sm font-semibold">Danger zone</p>
            <p className="text-xs text-fg-muted">
              Deletes this folder and all its assets.
            </p>
          </div>
          <ActionButton
            action={deleteFolder.bind(null, folder.id, {
              redirectTo: `/workflows/${folder.workflowId}`,
            })}
            confirm={{
              title: "Delete folder?",
              description: `“${folder.name}” and all its assets will be permanently deleted.`,
              confirmLabel: "Delete folder",
            }}
            variant="danger"
          >
            <Trash2 className="size-4" /> Delete folder
          </ActionButton>
        </section>
      </PageBody>
    </>
  );
}
