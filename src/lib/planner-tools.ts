import { z } from "zod";
import { db } from "@/lib/db-client";
import { slugify } from "@/lib/paths";
import { defineTool, text, type RunToolResult, type ToolDef } from "@/lib/run-tools";
import type { RunEventType } from "@/generated/prisma/enums";

// The planner tool set — phase 1 of Campaign Planning. Unlike the render tools,
// these do NOT touch disk or produce PNGs; they persist the AI's proposed
// content calendar + asset checklist into the Campaign's draft rows so the user
// can review and edit before scheduling.

export interface PlannerToolContext {
  campaignId: string;
  scope: "full" | "reroll" | "add";
  /** Target item for reroll/add scopes. */
  itemId?: string;
  record: (type: RunEventType, payload: unknown) => Promise<void>;
}

/** defineTool bound to PlannerToolContext (mirrors defineRunTool). */
function plannerTool<Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: Shape,
  execute: (
    ctx: PlannerToolContext,
    args: z.output<z.ZodObject<Shape>>,
  ) => Promise<RunToolResult>,
): ToolDef<PlannerToolContext> {
  return defineTool<PlannerToolContext, Shape>(name, description, shape, execute);
}

const planItemShape = {
  dayIndex: z.number().int().min(1).max(7),
  slotIndex: z.number().int().min(0).max(5),
  title: z.string().min(1),
  angle: z.string().optional(),
  instruction: z.string().min(1),
  caption: z.string().optional(),
  assetSlots: z
    .array(z.object({ requestSlug: z.string(), note: z.string() }))
    .default([]),
};

export const PLANNER_TOOLS: ToolDef<PlannerToolContext>[] = [
  plannerTool(
    "submit_campaign_plan",
    "Submit the content calendar as an array of distinct per-day/per-slot posts. " +
      "Each item must carry a concrete render instruction a downstream task can " +
      "execute verbatim. Call this exactly once. For a reroll/add scope, submit " +
      "only the single item you were asked to produce.",
    { items: z.array(z.object(planItemShape)) },
    async (ctx, args) => {
      const items = args.items;
      if (items.length === 0) return text("No items submitted.", true);

      if (ctx.scope === "reroll" && ctx.itemId) {
        const first = items[0];
        await db.campaignItem.update({
          where: { id: ctx.itemId },
          data: {
            title: first.title,
            angle: first.angle ?? null,
            instruction: first.instruction,
            caption: first.caption ?? null,
            assetPlan: first.assetSlots,
          },
        });
        await ctx.record("SYSTEM", { event: "plan_item_rerolled" });
        return text("Item updated.");
      }

      if (ctx.scope === "add") {
        await db.campaignItem.createMany({
          data: items.map((it) => ({
            campaignId: ctx.campaignId,
            dayIndex: it.dayIndex,
            slotIndex: it.slotIndex,
            title: it.title,
            angle: it.angle ?? null,
            instruction: it.instruction,
            caption: it.caption ?? null,
            assetPlan: it.assetSlots,
          })),
        });
        await ctx.record("SYSTEM", { event: "plan_items_added", count: items.length });
        return text(`Added ${items.length} item(s).`);
      }

      // full scope — replace the draft calendar.
      await db.$transaction([
        db.campaignItem.deleteMany({
          where: { campaignId: ctx.campaignId, status: "DRAFT" },
        }),
        db.campaignItem.createMany({
          data: items.map((it) => ({
            campaignId: ctx.campaignId,
            dayIndex: it.dayIndex,
            slotIndex: it.slotIndex,
            title: it.title,
            angle: it.angle ?? null,
            instruction: it.instruction,
            caption: it.caption ?? null,
            assetPlan: it.assetSlots,
          })),
        }),
      ]);
      await ctx.record("SYSTEM", { event: "plan_submitted", count: items.length });
      return text(`Submitted a ${items.length}-item plan.`);
    },
  ),

  plannerTool(
    "submit_asset_manifest",
    "Submit the campaign-level checklist of photos the user must upload for this " +
      "campaign. Each request is one kind of shot (with how many). Reference these " +
      "slugs from the plan items' assetSlots. Call this once after submit_campaign_plan.",
    {
      requests: z.array(
        z.object({
          slug: z.string().optional(),
          label: z.string().min(1),
          description: z.string().default(""),
          count: z.number().int().min(1).default(1),
        }),
      ),
    },
    async (ctx, args) => {
      const requests = args.requests;
      await db.$transaction([
        db.campaignAssetRequest.deleteMany({ where: { campaignId: ctx.campaignId } }),
        db.campaignAssetRequest.createMany({
          data: requests.map((r) => ({
            campaignId: ctx.campaignId,
            slug: r.slug ? slugify(r.slug) : slugify(r.label),
            label: r.label,
            description: r.description,
            count: r.count,
          })),
        }),
      ]);
      await ctx.record("SYSTEM", {
        event: "manifest_submitted",
        count: requests.length,
      });
      return text(`Submitted an asset manifest with ${requests.length} request(s).`);
    },
  ),
];
