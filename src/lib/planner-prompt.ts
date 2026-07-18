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
  format: "SINGLE" | "CAROUSEL";
  briefText: string;
  /** Absolute path of an uploaded brief file the planner may Read (e.g. a PDF). */
  briefFileAbs: string | null;
  scope: "full" | "reroll" | "add";
  existingItems: ExistingItemForPrompt[];
  /** For reroll: the item being regenerated. */
  targetItem?: ExistingItemForPrompt;
}

/**
 * Build the phase-1 planner prompt. The planner is a content strategist AND
 * copywriter, NOT a renderer: it produces a content calendar (with finished
 * copy) + an asset checklist via the submit_campaign_plan / submit_asset_manifest
 * tools and must not render images.
 */
export function buildPlannerPrompt(input: PlannerPromptInput): string {
  const {
    provider,
    workflowName,
    platform,
    globalInstruction,
    campaignName,
    format,
    briefText,
    briefFileAbs,
    scope,
    existingItems,
    targetItem,
  } = input;

  const formatRule =
    format === "CAROUSEL"
      ? "Each post is a CAROUSEL of 3–8 images. Decide the slide count per post from its content. " +
        "In each item's `instruction`, state it is a carousel of N slides and describe every slide " +
        "(slide 1 hook, following slides, last slide CTA). Each item's `assetSlots` must list the " +
        "3–8 photos that post needs, and the asset manifest must cover all of them."
      : "Each post is a SINGLE image. Each item uses exactly one photo — its `assetSlots` reference " +
        "one photo, and the `instruction` describes that single image.";

  const lines: string[] = [];

  lines.push(
    `You are a senior content strategist and copywriter planning a ${platform} campaign for the "${workflowName}" workflow.`,
    `You are PLANNING ONLY — do not render, draw, or produce any images. Your entire job is to`,
    `emit a content calendar with finished copy and a photo checklist through the provided tools.`,
    "",
    `Campaign: ${campaignName}`,
    "",
  );

  if (globalInstruction.trim()) {
    lines.push("## Workflow brand voice / rules", globalInstruction.trim(), "");
  }

  // Copy is the deliverable that most often falls flat, so make the standard
  // explicit. On Claude the copywriting skills are available and should be used;
  // Codex has no skill mechanism, so the same principles are stated inline for
  // both engines.
  if (provider === "CLAUDE") {
    lines.push(
      "## Copy craft",
      "Before writing any headline or caption, use the `copywriting` and",
      "`content-strategy-sms` skills to raise the quality of the copy. Apply their",
      "guidance to every post.",
      "",
    );
  }

  lines.push(
    "## Copy quality bar",
    "Every post must clear this bar — weak, generic copy is a failure:",
    "- One idea per post. If a post tries to say two things, split it or cut one.",
    "- Lead with a specific, concrete hook — a number, a tension, a claim, or a",
    "  question the target audience actually has. Never open with filler like",
    '  "Introducing…", "In today\'s world…", or "We are excited to…".',
    "- Write to one reader in the brand voice. Plain, confident language. No",
    "  clichés, no hype adjectives stacked together, no empty superlatives.",
    "- Every post earns its place with a clear angle and a reason to stop scrolling.",
    "- End with a purposeful CTA (save, follow, comment, DM, link) that fits the post.",
    "",
  );

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

  lines.push("## Image format", formatRule, "");

  lines.push(
    "## Two copy surfaces (keep them distinct)",
    "Each post has two separate pieces of copy — write both:",
    "1. OVERLAY copy — the short text rendered ON the image. Punchy and minimal",
    "   (aim for a hook line under ~8 words plus an optional sub-line). Put it in",
    "   the item's `instruction` so the rendering agent places it verbatim.",
    "2. CAPTION — the Instagram caption posted with the image. Put it in the item's",
    "   `caption` field. Structure it as: a scroll-stopping first line, 1–3 short",
    "   body lines that deliver the idea, one clear CTA, then 3–8 relevant hashtags.",
    "The overlay is not the caption — do not just repeat the headline in the caption.",
    "",
  );

  if (scope === "reroll" && targetItem) {
    lines.push(
      "## Task: regenerate ONE item",
      `Produce a fresh, distinctly different take on Day ${targetItem.dayIndex}, slot ${
        targetItem.slotIndex + 1
      } (currently "${targetItem.title}"). Keep the same dayIndex (${targetItem.dayIndex}) and`,
      `slotIndex (${targetItem.slotIndex}). Write both a finished OVERLAY (in \`instruction\`) and a`,
      "finished `caption`, clearing the copy quality bar. Call submit_campaign_plan with exactly ONE item.",
      "Do not call submit_asset_manifest.",
      "",
    );
  } else if (scope === "add") {
    lines.push(
      "## Task: add new item(s)",
      "Propose one or more additional posts that complement the existing calendar without",
      "duplicating angles. Use dayIndex/slotIndex values that fit the existing schedule.",
      "Each new item must carry both a finished OVERLAY (in `instruction`) and a finished `caption`,",
      "clearing the copy quality bar. Call submit_campaign_plan with the new item(s). Update",
      "submit_asset_manifest only if the new items need photos not already requested.",
      "",
    );
  } else {
    lines.push(
      "## Task: plan the full campaign",
      "1. Break the brief into DISTINCT daily content — each day (and each slot within a day) is a",
      "   different angle, never a repeat. Day 1 hooks, later days build/vary the theme.",
      "2. Span at most 7 days. You may place multiple slots on the same day (slotIndex 0,1,...).",
      "3. For each post write a concrete `instruction` a rendering agent can execute verbatim: the",
      "   OVERLAY copy (exact words to render), layout intent, mood, and which photo (by request",
      "   slug) it uses.",
      "4. For each post write a finished `caption` — do not leave it empty. It must clear the copy",
      "   quality bar and follow the caption structure above.",
      "5. Call submit_campaign_plan with ALL items (each carrying both `instruction` and `caption`).",
      "6. Then call submit_asset_manifest listing every distinct photo the user must upload, each with",
      "   a stable `slug` the plan items reference in their assetSlots.",
      "",
    );
  }

  lines.push("Begin now.");
  return lines.join("\n");
}
