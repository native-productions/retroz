import { db } from "@/lib/db-client";
import { modelLabel } from "@/lib/models";
import { TasksBrowser } from "@/components/task/tasks-browser";

export async function TasksTab({ workflowId }: { workflowId: string }) {
  const [tasks, folders, campaigns] = await Promise.all([
    db.task.findMany({
      where: { workflowId },
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
        model: modelLabel(t.model),
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
