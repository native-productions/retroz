"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db-client";
import { toAbsolute, slugify } from "@/lib/paths";
import { providerOfModel } from "@/lib/models";
import { enqueuePlannerRun } from "@/lib/run-queue";
import { campaignDir } from "@/lib/planner-executor";
import { zonedInstant } from "@/lib/campaign-time";
import {
  campaignCreateSchema,
  campaignItemUpdateSchema,
  campaignItemAddSchema,
  campaignAssignAssetsSchema,
  campaignApproveSchema,
} from "@/lib/validation";

async function uniqueFolderSlug(
  workflowId: string,
  base: string,
): Promise<string> {
  let slug = slugify(base);
  let n = 1;
  while (
    await db.assetFolder.findUnique({
      where: { workflowId_slug: { workflowId, slug } },
    })
  ) {
    slug = `${slugify(base)}-${++n}`;
  }
  return slug;
}

export async function createCampaign(input: unknown) {
  const data = campaignCreateSchema.parse(input);
  const workflow = await db.workflow.findUniqueOrThrow({
    where: { id: data.workflowId },
  });

  // One campaign-level asset folder (reuses AssetFolder / Asset).
  const slug = await uniqueFolderSlug(data.workflowId, `campaign-${data.name}`);
  const relPath = path.join("data", "assets", workflow.slug, slug);
  await fs.mkdir(toAbsolute(relPath), { recursive: true });
  const folder = await db.assetFolder.create({
    data: {
      workflowId: data.workflowId,
      name: `${data.name} assets`,
      slug,
      relPath,
      notes: "Campaign assets",
    },
  });

  // Model implies the engine — a Codex model pins the campaign to Codex, etc.
  const provider = providerOfModel(data.model);

  const campaign = await db.campaign.create({
    data: {
      workflowId: data.workflowId,
      name: data.name,
      brief: data.brief ?? "",
      format: data.format,
      model: data.model ?? null,
      provider,
      assetFolderId: folder.id,
    },
  });

  revalidatePath(`/workflows/${data.workflowId}`);
  return { id: campaign.id };
}

/** Kick off a planner run (phase 1). scope full = plan everything; reroll/add
 *  regenerate/extend a draft calendar. */
export async function runPlanner(
  campaignId: string,
  scope: "full" | "reroll" | "add" = "full",
  itemId?: string,
) {
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  const planRun = await db.campaignPlanRun.create({
    data: { campaignId, scope, itemId: itemId ?? null, status: "QUEUED" },
  });

  if (scope === "full") {
    await db.campaign.update({
      where: { id: campaignId },
      data: { status: "PLANNING" },
    });
  }

  enqueuePlannerRun(planRun.id);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/workflows/${campaign.workflowId}`);
}

export async function rerollCampaignItem(itemId: string) {
  const item = await db.campaignItem.findUniqueOrThrow({ where: { id: itemId } });
  await runPlanner(item.campaignId, "reroll", itemId);
}

export async function updateCampaignItem(input: unknown) {
  const data = campaignItemUpdateSchema.parse(input);
  const { id, ...rest } = data;
  const item = await db.campaignItem.update({ where: { id }, data: rest });
  revalidatePath(`/campaigns/${item.campaignId}`);
}

export async function addCampaignItem(input: unknown) {
  const data = campaignItemAddSchema.parse(input);
  await db.campaignItem.create({
    data: {
      campaignId: data.campaignId,
      dayIndex: data.dayIndex,
      slotIndex: data.slotIndex,
      title: data.title,
      instruction: data.instruction ?? "",
    },
  });
  revalidatePath(`/campaigns/${data.campaignId}`);
}

export async function deleteCampaignItem(id: string) {
  const item = await db.campaignItem.delete({ where: { id } });
  // Keep the workflow in sync: drop the backing task too (if it was materialized).
  if (item.taskId) {
    const task = await db.task
      .delete({ where: { id: item.taskId } })
      .catch(() => null);
    if (task) revalidatePath(`/workflows/${task.workflowId}`);
  }
  revalidatePath(`/campaigns/${item.campaignId}`);
}

export async function assignItemAssets(input: unknown) {
  const data = campaignAssignAssetsSchema.parse(input);
  const item = await db.campaignItem.findUniqueOrThrow({
    where: { id: data.itemId },
  });
  await db.$transaction([
    db.campaignItemAsset.deleteMany({ where: { campaignItemId: data.itemId } }),
    db.campaignItemAsset.createMany({
      data: data.assetIds.map((assetId) => ({
        campaignItemId: data.itemId,
        assetId,
      })),
    }),
  ]);
  revalidatePath(`/campaigns/${item.campaignId}`);
}

/**
 * Approve the draft calendar and materialize the schedule: one Task per item,
 * each with a concrete scheduledAt (wall-clock in the campaign timezone).
 */
export async function approveCampaign(input: unknown) {
  const data = campaignApproveSchema.parse(input);
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id: data.campaignId },
    include: {
      workflow: true,
      items: {
        where: { status: { notIn: ["SKIPPED", "CANCELLED"] } },
        orderBy: [{ dayIndex: "asc" }, { slotIndex: "asc" }],
      },
      assetRequests: true,
    },
  });

  // Render tasks inherit the campaign's chosen engine + model (falling back to
  // the model the planner actually ran with, then the workflow default).
  const lastPlan = await db.campaignPlanRun.findFirst({
    where: { campaignId: campaign.id, status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { model: true, provider: true },
  });
  const taskProvider = campaign.provider ?? lastPlan?.provider ?? null;
  const taskModel =
    campaign.model ?? lastPlan?.model ?? campaign.workflow.defaultModel ?? null;

  // Validate every item fits the chosen window before materializing anything.
  for (const item of campaign.items) {
    if (item.dayIndex > data.durationDays) {
      throw new Error(
        `Item "${item.title}" is on day ${item.dayIndex}, beyond the ${data.durationDays}-day window.`,
      );
    }
    if (item.slotIndex >= data.slotTimes.length) {
      throw new Error(
        `Item "${item.title}" uses slot ${item.slotIndex + 1}, but only ${data.slotTimes.length} slot time(s) were set.`,
      );
    }
  }

  for (const item of campaign.items) {
    const scheduledAt = zonedInstant(
      data.startDate,
      item.dayIndex - 1,
      data.slotTimes[item.slotIndex],
      data.timezone,
    );
    const task = await db.task.create({
      data: {
        workflowId: campaign.workflowId,
        name: `${campaign.name} · D${item.dayIndex} S${item.slotIndex + 1} · ${item.title}`,
        instruction: item.instruction,
        assetFolderId: campaign.assetFolderId,
        model: taskModel,
        provider: taskProvider,
      },
    });
    await db.campaignItem.update({
      where: { id: item.id },
      data: { taskId: task.id, scheduledAt, status: "SCHEDULED" },
    });
  }

  const unfulfilled = campaign.assetRequests.some((r) => !r.fulfilled);
  await db.campaign.update({
    where: { id: campaign.id },
    data: {
      startDate: new Date(`${data.startDate}T00:00:00Z`),
      durationDays: data.durationDays,
      slotsPerDay: data.slotsPerDay,
      slotTimes: data.slotTimes,
      timezone: data.timezone,
      status: unfulfilled ? "AWAITING_ASSETS" : "SCHEDULED",
    },
  });

  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath(`/workflows/${campaign.workflowId}`);
}

export async function setAssetRequestFulfilled(id: string, fulfilled: boolean) {
  const req = await db.campaignAssetRequest.update({
    where: { id },
    data: { fulfilled },
  });
  // If every request is now satisfied, advance an awaiting campaign to scheduled.
  if (fulfilled) {
    const campaign = await db.campaign.findUnique({
      where: { id: req.campaignId },
      include: { assetRequests: true },
    });
    if (
      campaign?.status === "AWAITING_ASSETS" &&
      campaign.assetRequests.every((r) => r.fulfilled)
    ) {
      await db.campaign.update({
        where: { id: campaign.id },
        data: { status: "SCHEDULED" },
      });
    }
  }
  revalidatePath(`/campaigns/${req.campaignId}`);
}

export async function cancelCampaign(id: string) {
  const campaign = await db.campaign.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  revalidatePath(`/campaigns/${id}`);
  revalidatePath(`/workflows/${campaign.workflowId}`);
}

export async function deleteCampaign(id: string) {
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id },
    include: {
      items: { select: { taskId: true } },
      assetFolder: { select: { id: true, relPath: true } },
    },
  });

  // Delete the render tasks this campaign owns (cascades their TaskRuns) — the
  // campaign delete only cascades CampaignItem rows, leaving tasks orphaned.
  const taskIds = campaign.items
    .map((i) => i.taskId)
    .filter((t): t is string => Boolean(t));
  if (taskIds.length > 0) {
    await db.task.deleteMany({ where: { id: { in: taskIds } } });
  }

  await db.campaign.delete({ where: { id } });

  // Remove the campaign's dedicated asset folder (+ files) and planner scratch dir.
  if (campaign.assetFolder) {
    await db.assetFolder
      .delete({ where: { id: campaign.assetFolder.id } })
      .catch(() => null);
    await fs.rm(toAbsolute(campaign.assetFolder.relPath), {
      recursive: true,
      force: true,
    });
  }
  await fs.rm(campaignDir(id), { recursive: true, force: true });

  revalidatePath(`/workflows/${campaign.workflowId}`);
  redirect(`/workflows/${campaign.workflowId}?tab=plan`);
}
