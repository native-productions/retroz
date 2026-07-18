import Link from "next/link";
import {
  Rocket,
  FolderOpen,
  Cpu,
  Play,
  Trash2,
  CalendarRange,
} from "lucide-react";
import { db } from "@/lib/db-client";
import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/ui-badge";
import { Card } from "@/components/ui/ui-card";
import { ActionButton } from "@/components/ui/ui-action-button";
import { modelLabel } from "@/lib/models";
import { TaskCreateDialog } from "@/components/task/task-create-dialog";
import { triggerRun, deleteTask } from "@/lib/actions/task-actions";

export async function TasksTab({ workflowId }: { workflowId: string }) {
  const [tasks, folders] = await Promise.all([
    db.task.findMany({
      where: { workflowId },
      orderBy: { createdAt: "desc" },
      include: {
        assetFolder: true,
        _count: { select: { runs: true } },
        campaignItem: {
          select: { campaignId: true, campaign: { select: { name: true } } },
        },
      },
    }),
    db.assetFolder.findMany({
      where: { workflowId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </p>
        <TaskCreateDialog workflowId={workflowId} folders={folders} />
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<Rocket className="size-6" />}
          title="No tasks yet"
          description="A task tells Claude what to make and which asset folder to use."
          action={
            <TaskCreateDialog
              workflowId={workflowId}
              folders={folders}
              variant="secondary"
            />
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <Card
              key={t.id}
              className="flex items-center justify-between gap-3 p-4"
            >
              <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
                <p className="inline-flex items-center gap-2 truncate font-display font-semibold hover:underline">
                  {t.name}
                  {t.campaignItem ? (
                    <Badge tone="accent">
                      <CalendarRange className="size-3" /> Plan
                    </Badge>
                  ) : null}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-fg-muted font-mono">
                  <span className="inline-flex items-center gap-1">
                    <FolderOpen className="size-3.5" />
                    {t.assetFolder?.name ?? "no folder"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Cpu className="size-3.5" />
                    {modelLabel(t.model)}
                  </span>
                  <span>{t._count.runs} runs</span>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <ActionButton
                  action={triggerRun.bind(null, t.id)}
                  variant="primary"
                  size="sm"
                >
                  <Play className="size-4" /> Run
                </ActionButton>
                {t.campaignItem ? (
                  <Link
                    href={`/campaigns/${t.campaignItem.campaignId}`}
                    className="font-mono text-xs text-fg-muted underline"
                    title={`Managed by campaign: ${t.campaignItem.campaign.name}`}
                  >
                    Campaign
                  </Link>
                ) : (
                  <ActionButton
                    action={deleteTask.bind(null, t.id)}
                    confirm={`Delete task "${t.name}"?`}
                    variant="ghost"
                    size="icon"
                  >
                    <Trash2 className="size-4" />
                  </ActionButton>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
