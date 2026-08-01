import { db } from "@/lib/db-client";
import { modelLabel } from "@/lib/models";
import { getModelCatalog } from "@/lib/model-catalog";
import { TasksBrowser } from "@/components/task/tasks-browser";

export async function TasksTab({ workflowId }: { workflowId: string }) {
  const { labels } = await getModelCatalog();
  const [tasks, folders, campaigns] = await Promise.all([
    db.task.findMany({
      // Work sessions run on hidden tasks — they belong to the Work page, not
      // to the workflow's task list.
      where: { workflowId, workSession: null },
      orderBy: { createdAt: "desc" },
      include: {
        assetFolder: { select: { name: true } },
        _count: { select: { runs: true } },
        campaignItem: {
          select: {
            campaignId: true,
            dayIndex: true,
            slotIndex: true,
            campaign: { select: { name: true } },
          },
        },
      },
    }),
    db.assetFolder.findMany({
      where: { workflowId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.campaign.findMany({
      where: { workflowId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return (
    <TasksBrowser
      workflowId={workflowId}
      folders={folders}
      tasks={tasks.map((t) => ({
        id: t.id,
        name: t.name,
        folderName: t.assetFolder?.name ?? null,
        model: modelLabel(t.model, labels),
        runs: t._count.runs,
        campaignId: t.campaignItem?.campaignId ?? null,
        campaignName: t.campaignItem?.campaign.name ?? null,
        dayIndex: t.campaignItem?.dayIndex ?? null,
        slotIndex: t.campaignItem?.slotIndex ?? null,
      }))}
      campaigns={campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        items: c._count.items,
        durationDays: c.durationDays,
        slotsPerDay: c.slotsPerDay,
      }))}
    />
  );
}
