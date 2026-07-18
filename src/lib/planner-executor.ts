import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/lib/db-client";
import { DATA_ROOT, toAbsolute } from "@/lib/paths";
import { resolveProviderModel } from "@/lib/models";
import { emitRunEvent, type RunBusEvent } from "@/lib/run-bus";
import {
  registerToolContext,
  releaseToolContext,
  type ToolDef,
} from "@/lib/run-tools";
import { PLANNER_TOOLS, type PlannerToolContext } from "@/lib/planner-tools";
import { buildPlannerPrompt } from "@/lib/planner-prompt";
import { runClaudeAgent } from "@/lib/claude-backend";
import { runCodexAgent } from "@/lib/codex-backend";
import type { RunEventType } from "@/generated/prisma/enums";

/** Scratch dir the planner agent runs in (also where a brief file lives). */
export function campaignDir(campaignId: string): string {
  return path.join(DATA_ROOT, "campaigns", campaignId);
}

/** Execute one queued CampaignPlanRun end-to-end. Persists events; writes the
 *  drafted calendar + asset manifest via the planner tools. */
export async function executePlannerRun(planRunId: string): Promise<void> {
  const planRun = await db.campaignPlanRun.findUnique({
    where: { id: planRunId },
    include: {
      campaign: {
        include: {
          workflow: true,
          items: { orderBy: [{ dayIndex: "asc" }, { slotIndex: "asc" }] },
        },
      },
    },
  });
  if (!planRun) return;

  const { campaign } = planRun;
  const settings = await db.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const { provider, model } = resolveProviderModel({
    pinnedProvider: campaign.provider,
    candidates: [planRun.model, campaign.model, campaign.workflow.defaultModel],
    claudeDefault: settings.defaultModel,
    codexDefault: settings.codexModel,
  });

  const cwd = campaignDir(campaign.id);
  await fs.mkdir(cwd, { recursive: true });

  // --- event recorder (persist + live tap), keyed by the plan run id ---
  let seq = 0;
  async function record(type: RunEventType, payload: unknown) {
    const s = seq++;
    const ts = new Date();
    await db.runEvent.create({
      data: { campaignPlanRunId: planRunId, seq: s, type, payload: payload as object },
    });
    emitRunEvent(planRunId, {
      seq: s,
      type: type as RunBusEvent["type"],
      payload,
      ts: ts.toISOString(),
    });
  }

  await db.campaignPlanRun.update({
    where: { id: planRunId },
    data: { status: "RUNNING", startedAt: new Date(), provider, model },
  });
  await record("STATUS", { status: "RUNNING" });

  const targetItem =
    planRun.itemId != null
      ? campaign.items.find((i) => i.id === planRun.itemId)
      : undefined;

  const prompt = buildPlannerPrompt({
    provider,
    workflowName: campaign.workflow.name,
    platform: campaign.workflow.platform,
    globalInstruction: campaign.workflow.globalInstruction,
    campaignName: campaign.name,
    format: campaign.format as "SINGLE" | "CAROUSEL",
    briefText: campaign.brief,
    briefFileAbs: campaign.briefRelPath ? toAbsolute(campaign.briefRelPath) : null,
    scope: planRun.scope as "full" | "reroll" | "add",
    existingItems: campaign.items.map((i) => ({
      dayIndex: i.dayIndex,
      slotIndex: i.slotIndex,
      title: i.title,
      angle: i.angle,
    })),
    targetItem: targetItem
      ? {
          dayIndex: targetItem.dayIndex,
          slotIndex: targetItem.slotIndex,
          title: targetItem.title,
          angle: targetItem.angle,
        }
      : undefined,
  });

  const toolContext: PlannerToolContext = {
    campaignId: campaign.id,
    scope: planRun.scope as "full" | "reroll" | "add",
    itemId: planRun.itemId ?? undefined,
    record,
  };

  const onSessionId = async (sessionId: string) => {
    if (planRun.sessionId) return;
    await db.campaignPlanRun.update({
      where: { id: planRunId },
      data: { sessionId },
    });
  };

  const shared = {
    prompt,
    model,
    cwd,
    additionalDirectories: [cwd],
    tools: PLANNER_TOOLS as unknown as ToolDef<unknown>[],
    toolContext,
    abortController: new AbortController(),
    record,
    onSessionId,
  };

  const mcpToken =
    provider === "CODEX" ? registerToolContext(toolContext, PLANNER_TOOLS) : null;

  try {
    const result =
      provider === "CODEX"
        ? await runCodexAgent({
            ...shared,
            reasoningEffort: settings.codexReasoningEffort,
            mcpServerUrl: `http://127.0.0.1:${process.env.PORT ?? "3020"}/api/mcp/${mcpToken}`,
          })
        : await runClaudeAgent({
            ...shared,
            skills: "all",
            baseTools: ["Read"],
            stripApiKey: settings.claudeAuthMode === "SUBSCRIPTION",
          });

    await db.campaignPlanRun.update({
      where: { id: planRunId },
      data: {
        status: result.ok ? "DONE" : "FAILED",
        finishedAt: new Date(),
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        cacheCreationTokens: result.cacheCreationTokens,
        cacheReadTokens: result.cacheReadTokens,
        numTurns: result.numTurns,
        durationMs: result.durationMs,
        durationApiMs: result.durationApiMs,
        costUsd: result.costUsd,
        modelUsage: result.modelUsage ?? undefined,
        error: result.error,
      },
    });

    if (result.ok) {
      // Draft ready — move the campaign into review (unless the user cancelled).
      await db.campaign.updateMany({
        where: { id: campaign.id, status: { in: ["PLANNING", "REVIEW"] } },
        data: { status: "REVIEW" },
      });
    }

    await record("STATUS", {
      status: result.ok ? "DONE" : "FAILED",
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      cacheCreationTokens: result.cacheCreationTokens,
      cacheReadTokens: result.cacheReadTokens,
      costUsd: result.costUsd,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.campaignPlanRun.update({
      where: { id: planRunId },
      data: { status: "FAILED", finishedAt: new Date(), error: msg },
    });
    await record("ERROR", { message: msg });
    await record("STATUS", { status: "FAILED" });
  } finally {
    if (mcpToken) releaseToolContext(mcpToken);
  }
}
