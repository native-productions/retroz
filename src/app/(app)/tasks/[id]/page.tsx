import { notFound } from "next/navigation";
import Link from "next/link";
import { Clock, Trash2 } from "lucide-react";
import { db } from "@/lib/db-client";
import { PageHeader, PageBody, EmptyState } from "@/components/page-header";
import { ActionButton } from "@/components/ui/ui-action-button";
import { modelLabel } from "@/lib/models";
import { TaskRunButton } from "@/components/task/task-run-button";
import { TaskEditor } from "@/components/task/task-editor";
import { TaskGallery } from "@/components/task/task-gallery";
import { deleteTask } from "@/lib/actions/task-actions";
import { RunStatusBadge } from "@/components/run/run-status-badge";

export const dynamic = "force-dynamic";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await db.task.findUnique({
    where: { id },
    include: {
      workflow: {
        include: { assetFolders: { orderBy: { name: "asc" } } },
      },
      assetFolder: { include: { _count: { select: { assets: true } } } },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { _count: { select: { artifacts: true } } },
      },
    },
  });
  if (!task) notFound();

  // All rendered images across this task's runs, newest first.
  const galleryImages = (
    await db.runArtifact.findMany({
      where: { taskRun: { taskId: id } },
      orderBy: { createdAt: "desc" },
    })
  ).map((a) => ({ id: a.id, filename: a.filename, relPath: a.relPath }));

  return (
    <>
      <PageHeader
        title={task.name}
        breadcrumb={[
          { label: "Workflows", href: "/workflows" },
          { label: task.workflow.name, href: `/workflows/${task.workflowId}` },
          { label: task.name },
        ]}
      >
        <TaskRunButton taskId={task.id} />
      </PageHeader>

      <PageBody className="flex flex-col gap-5">
        <TaskEditor
          taskId={task.id}
          initialName={task.name}
          initialInstruction={task.instruction}
          initialFolderId={task.assetFolderId}
          initialModel={task.model}
          folders={task.workflow.assetFolders.map((f) => ({
            id: f.id,
            name: f.name,
          }))}
        />

        <div className="grid gap-5 lg:grid-cols-5">
          <section className="flex flex-col gap-3 lg:col-span-3">
            <h2 className="font-display text-lg font-semibold">Runs</h2>
            {task.runs.length === 0 ? (
              <EmptyState
                icon={<Clock className="size-6" />}
                title="No runs yet"
                description="Hit “Run now” to let Claude produce the images."
              />
            ) : (
              <div className="flex flex-col gap-2 max-h-[540px] overflow-y-auto overflow-x-hidden">
                {task.runs.map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="retro-card retro-press flex items-center justify-between p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {run.outputRelPath?.split("/").pop() ?? run.id}
                      </p>
                      <p className="text-xs text-fg-muted font-mono">
                        {run._count.artifacts} images · {modelLabel(run.model)}
                      </p>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Gallery</h2>
              <span className="font-mono text-xs text-fg-muted">
                {galleryImages.length} images
              </span>
            </div>
            <TaskGallery images={galleryImages} />
          </section>
        </div>

        <section className="flex items-center justify-between gap-3 border-t-2 border-border pt-5">
          <div>
            <p className="font-display text-sm font-semibold">Danger zone</p>
            <p className="text-xs text-fg-muted">
              Deletes this task and all its runs.
            </p>
          </div>
          <ActionButton
            action={deleteTask.bind(null, task.id)}
            confirm={{
              title: "Delete task?",
              description: `“${task.name}” and all its runs will be permanently deleted.`,
              confirmLabel: "Delete task",
            }}
            variant="danger"
          >
            <Trash2 className="size-4" /> Delete task
          </ActionButton>
        </section>
      </PageBody>
    </>
  );
}
