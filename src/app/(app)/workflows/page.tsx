import Link from "next/link";
import {
  Workflow as WorkflowIcon,
  Image as ImageIcon,
  Rocket,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/db-client";
import { PageHeader, PageBody, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/ui-card";
import { Badge } from "@/components/ui/ui-badge";
import { ActionButton } from "@/components/ui/ui-action-button";
import { WorkflowCreateDialog } from "@/components/workflow/workflow-create-dialog";
import { deleteWorkflow } from "@/lib/actions/workflow-actions";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const workflows = await db.workflow.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { tasks: true, assetFolders: true, schedules: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Workflows"
        description="One workflow per channel or content pillar."
        breadcrumb={[{ label: "Workflows" }]}
      >
        <WorkflowCreateDialog />
      </PageHeader>

      <PageBody>
        {workflows.length === 0 ? (
          <EmptyState
            icon={<WorkflowIcon className="size-6" />}
            title="No workflows yet"
            description="Create your first workflow to start managing Instagram content with Claude."
            action={<WorkflowCreateDialog />}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <Card key={wf.id} className="h-full p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/workflows/${wf.id}`}
                    className="min-w-0 flex-1"
                  >
                    <h3 className="font-display text-lg font-semibold truncate hover:underline">
                      {wf.name}
                    </h3>
                    <p className="text-xs text-fg-muted font-mono">
                      /{wf.slug}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="secondary">{wf.platform}</Badge>
                    <ActionButton
                      action={deleteWorkflow.bind(null, wf.id)}
                      confirm={{
                        title: "Delete workflow?",
                        description: `“${wf.name}” and all its folders, tasks, and runs will be permanently deleted.`,
                        confirmLabel: "Delete workflow",
                      }}
                      variant="ghost"
                      size="icon"
                      className="size-8"
                    >
                      <Trash2 className="size-4" />
                    </ActionButton>
                  </div>
                </div>
                <Link
                  href={`/workflows/${wf.id}`}
                  className="flex flex-1 flex-col gap-3"
                >
                  {wf.description ? (
                    <p className="text-sm text-fg-muted line-clamp-2">
                      {wf.description}
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center gap-4 pt-2 text-xs text-fg-muted font-mono">
                    <span className="flex items-center gap-1">
                      <Rocket className="size-3.5" /> {wf._count.tasks} tasks
                    </span>
                    <span className="flex items-center gap-1">
                      <ImageIcon className="size-3.5" />{" "}
                      {wf._count.assetFolders} folders
                    </span>
                  </div>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
