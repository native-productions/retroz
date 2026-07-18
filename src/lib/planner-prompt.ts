import type { AgentProvider } from "@/generated/prisma/enums";

interface ExistingItemForPrompt {
  dayIndex: number;
  slotIndex: number;
  title: string;
  angle: string | null;
}

export interface PlannerPromptInput {
  provider: AgentProvider;
  workflowName: string;
  platform: string;
  globalInstruction: string;
  campaignName: string;
  briefText: string;
  /** Absolute path of an uploaded brief file the planner may Read (e.g. a PDF). */
  briefFileAbs: string | null;
  scope: "full" | "reroll" | "add";
  existingItems: ExistingItemForPrompt[];
  /** For reroll: the item being regenerated. */
  targetItem?: ExistingItemForPrompt;
}

/**
 * Build the phase-1 planner prompt. The planner is a content strategist, NOT a
 * renderer: it produces a content calendar + an asset checklist via the
 * submit_campaign_plan / submit_asset_manifest tools and must not render images.
 */
export function buildPlannerPrompt(input: PlannerPromptInput): string {
  const {
    workflowName,
    platform,
    globalInstruction,
    campaignName,
    briefText,
    briefFileAbs,
    scope,
    existingItems,
    targetItem,
  } = input;

  const lines: string[] = [];

  lines.push(
    `You are a content strategist planning a ${platform} campaign for the "${workflowName}" workflow.`,
    `You are PLANNING ONLY — do not render, draw, or produce any images. Your entire job is to`,
    `emit a content calendar and a photo checklist through the provided tools.`,
    "",
    `Campaign: ${campaignName}`,
    "",
  );

  if (globalInstruction.trim()) {
    lines.push("## Workflow brand voice / rules", globalInstruction.trim(), "");
  }

  lines.push("## Campaign brief");
  if (briefText.trim()) {
    lines.push(briefText.trim(), "");
  }
  if (briefFileAbs) {
    lines.push(
      `An additional brief file is attached. Read it before planning:`,
      `  ${briefFileAbs}`,
      "",
    );
  }
  if (!briefText.trim() && !briefFileAbs) {
    lines.push("(No brief text provided — infer a sensible campaign from the workflow rules.)", "");
  }

  if (existingItems.length > 0 && scope !== "full") {
    lines.push("## Existing calendar (for context — do not duplicate)");
    for (const it of existingItems) {
      lines.push(
        `  - Day ${it.dayIndex}, slot ${it.slotIndex + 1}: ${it.title}${
          it.angle ? ` — ${it.angle}` : ""
        }`,
      );
    }
    lines.push("");
  }

  if (scope === "reroll" && targetItem) {
    lines.push(
      "## Task: regenerate ONE item",
      `Produce a fresh, distinctly different take on Day ${targetItem.dayIndex}, slot ${
        targetItem.slotIndex + 1
      } (currently "${targetItem.title}"). Keep the same dayIndex (${targetItem.dayIndex}) and`,
      `slotIndex (${targetItem.slotIndex}). Call submit_campaign_plan with exactly ONE item.`,
      "Do not call submit_asset_manifest.",
      "",
    );
  } else if (scope === "add") {
    lines.push(
      "## Task: add new item(s)",
      "Propose one or more additional posts that complement the existing calendar without",
      "duplicating angles. Use dayIndex/slotIndex values that fit the existing schedule.",
      "Call submit_campaign_plan with the new item(s). Update submit_asset_manifest only if the",
      "new items need photos not already requested.",
      "",
    );
  } else {
    lines.push(
      "## Task: plan the full campaign",
      "1. Break the brief into DISTINCT daily content — each day (and each slot within a day) is a",
      "   different angle, never a repeat. Day 1 hooks, later days build/vary the theme.",
      "2. Span at most 7 days. You may place multiple slots on the same day (slotIndex 0,1,...).",
      "3. For each post write a concrete `instruction` a rendering agent can execute verbatim: the",
      "   headline/overlay copy, layout intent, mood, and which photo (by request slug) it uses.",
      "4. Call submit_campaign_plan with ALL items.",
      "5. Then call submit_asset_manifest listing every distinct photo the user must upload, each with",
      "   a stable `slug` the plan items reference in their assetSlots.",
      "",
    );
  }

  lines.push("Begin now.");
  return lines.join("\n");
}
