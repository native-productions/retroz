import { db } from "@/lib/db-client";
import { enqueueRun } from "@/lib/run-queue";

// Bounded minute-ticker for Campaign Planning. Fires materialized campaign items
// when their scheduledAt arrives, reconciles fired items against their TaskRun,
// and marks campaigns complete. Unlike node-cron schedules, nothing recurs —
// once every slot has fired and reconciled the campaign is done.

const globalForTicker = globalThis as unknown as {
  campaignTickerBooted?: boolean;
  campaignTickerHandle?: ReturnType<typeof setInterval>;
};

const TERMINAL = ["DONE", "FAILED", "CANCELLED"] as const;

async function fireDueItems(now: Date): Promise<void> {
  const due = await db.campaignItem.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
      taskId: { not: null },
      campaign: { status: { in: ["SCHEDULED", "RUNNING"] } },
    },
    select: { id: true, taskId: true, campaignId: true },
  });

  for (const item of due) {
    if (!item.taskId) continue;
    // Atomic guard against a double-fire across overlapping ticks.
    const claimed = await db.campaignItem.updateMany({
      where: { id: item.id, status: "SCHEDULED" },
      data: { status: "RUNNING" },
    });
    if (claimed.count !== 1) continue;

    const run = await db.taskRun.create({
      data: { taskId: item.taskId, status: "QUEUED", trigger: "campaign" },
    });
    await db.campaignItem.update({
      where: { id: item.id },
      data: { taskRunId: run.id },
    });
    await db.campaign.updateMany({
      where: { id: item.campaignId, status: "SCHEDULED" },
      data: { status: "RUNNING" },
    });
    enqueueRun(run.id);
  }
}

async function reconcileRunningItems(): Promise<void> {
  const running = await db.campaignItem.findMany({
    where: { status: "RUNNING", taskRunId: { not: null } },
    select: { id: true, taskRunId: true },
  });

  for (const item of running) {
    if (!item.taskRunId) continue;
    const run = await db.taskRun.findUnique({
      where: { id: item.taskRunId },
      select: { status: true },
    });
    if (!run) continue;
    if ((TERMINAL as readonly string[]).includes(run.status)) {
      // DONE/FAILED/CANCELLED exist in both enums; the guard above proves membership.
      await db.campaignItem.update({
        where: { id: item.id },
        data: { status: run.status as (typeof TERMINAL)[number] },
      });
    }
  }
}

async function completeCampaigns(): Promise<void> {
  const active = await db.campaign.findMany({
    where: { status: "RUNNING" },
    select: {
      id: true,
      items: { select: { status: true } },
    },
  });

  for (const campaign of active) {
    const live = campaign.items.filter((i) => i.status !== "SKIPPED");
    if (live.length === 0) continue;
    const allDone = live.every((i) =>
      (TERMINAL as readonly string[]).includes(i.status),
    );
    if (allDone) {
      await db.campaign.update({
        where: { id: campaign.id },
        data: { status: "COMPLETED" },
      });
    }
  }
}

async function tick(): Promise<void> {
  try {
    const now = new Date();
    await fireDueItems(now);
    await reconcileRunningItems();
    await completeCampaigns();
  } catch (err) {
    console.error("[campaign-ticker] tick failed", err);
  }
}

export function bootCampaignTicker(): void {
  if (globalForTicker.campaignTickerBooted) return;
  globalForTicker.campaignTickerBooted = true;
  globalForTicker.campaignTickerHandle = setInterval(() => {
    void tick();
  }, 60_000);
  console.log("[campaign-ticker] boot ok");
}
