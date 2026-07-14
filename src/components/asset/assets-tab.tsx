import Link from "next/link";
import { FolderOpen, Image as ImageIcon, Trash2 } from "lucide-react";
import { db } from "@/lib/db-client";
import { EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/ui-card";
import { ActionButton } from "@/components/ui/ui-action-button";
import { mediaUrl } from "@/lib/media";
import { FolderCreateDialog } from "@/components/asset/folder-create-dialog";
import { GlobalAssetsSection } from "@/components/asset/global-assets-section";
import { deleteFolder } from "@/lib/actions/asset-actions";

export async function AssetsTab({ workflowId }: { workflowId: string }) {
  const folders = await db.assetFolder.findMany({
    where: { workflowId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { assets: true } },
      assets: { take: 4, orderBy: { createdAt: "desc" } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <GlobalAssetsSection workflowId={workflowId} />

      <div className="flex items-center justify-between">
        <div>
          <p className="font-display font-semibold leading-tight">
            Asset folders
          </p>
          <p className="text-xs text-fg-muted">
            {folders.length} folder{folders.length === 1 ? "" : "s"} — a task
            picks one folder to work from.
          </p>
        </div>
        <FolderCreateDialog workflowId={workflowId} />
      </div>

      {folders.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="size-6" />}
          title="No asset folders"
          description="Create a folder, upload photos, then describe each so Claude knows what it's working with."
          action={<FolderCreateDialog workflowId={workflowId} variant="secondary" />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <Card key={folder.id} className="h-full p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/assets/${folder.id}`}
                  className="min-w-0 flex-1"
                >
                  <h4 className="font-display font-semibold truncate hover:underline">
                    {folder.name}
                  </h4>
                </Link>
                <span className="flex shrink-0 items-center gap-1 text-xs text-fg-muted font-mono">
                  <ImageIcon className="size-3.5" /> {folder._count.assets}
                </span>
                <ActionButton
                  action={deleteFolder.bind(null, folder.id)}
                  confirm={`Delete folder "${folder.name}" and its assets?`}
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                >
                  <Trash2 className="size-4" />
                </ActionButton>
              </div>
              <Link
                href={`/assets/${folder.id}`}
                className="grid grid-cols-4 gap-1.5"
              >
                {folder.assets.length === 0 ? (
                  <div className="col-span-4 grid h-16 place-items-center rounded-[4px] border-2 border-dashed border-border-soft text-xs text-fg-muted">
                    empty
                  </div>
                ) : (
                  folder.assets.map((a) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={a.id}
                      src={mediaUrl(a.relPath)}
                      alt={a.filename}
                      className="aspect-square w-full rounded-[4px] border-2 border-border object-cover"
                    />
                  ))
                )}
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
