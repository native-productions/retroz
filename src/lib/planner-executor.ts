import path from "node:path";
import { db } from "@/lib/db-client";
import { DATA_ROOT, toRelative } from "@/lib/paths";
import { openRunWorkspace } from "@/lib/run-workspace";
import { resolveProviderModel } from "@/lib/models";
import { emitRunEvent, type RunBusEvent } from "@/lib/run-bus";
import {
  registerToolContext,
  releaseToolContext,
  type ToolDef,
} from "@/lib/run-tools";
import { PLANNER_TOOLS, type PlannerToolContext } from "@/lib/planner-tools";
import { RESEARCH_TOOLS } from "@/lib/research-tools";
import { isTavilyConfigured } from "@/lib/tavily";
import { buildPlannerPrompt } from "@/lib/planner-prompt";
import { runClaudeAgent } from "@/lib/claude-backend";
import { runCodexAgent } from "@/lib/codex-backend";
import type { RunEventType } from "@/generated/prisma/enums";

/**
 * Storage key prefix for a campaign's working folder: the planner agent's
 * scratch space, and where an uploaded brief file lives.
 */
export function campaignPrefix(campaignId: string): string {
  return toRelative(path.join(DATA_ROOT, "campaigns", campaignId));
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

  // Web research. Null hides the tools completely — they never reach allowedTools
  // or the MCP tools/list, so the planner cannot burn a turn on a call that fails.
  const research =
    campaign.researchMode !== "OFF" && (await isTavilyConfigured())
      ? campaign.researchMode
      : null;

  // The planner reads an uploaded brief off disk, so the campaign folder is
  // staged locally the same way a render run stages its assets. On the local
  // driver this resolves to data/campaigns/<id> with no copying.
  const workspace = await openRunWorkspace(planRunId, campaignPrefix(campaign.id));
  const cwd = workspace.outDirAbs;

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
    // Hydrated alongside the rest of the campaign folder, so it is addressed
    // inside the workspace rather than at its stored key.
    briefFileAbs: campaign.briefRelPath
      ? path.join(cwd, path.basename(campaign.briefRelPath))
      : null,
    scope: planRun.scope as "full" | "reroll" | "add",
    research,
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

  // Research arrives as MCP tools, so the planner's base tool set stays Read-only.
  const tools = [
    ...(PLANNER_TOOLS as unknown as ToolDef<unknown>[]),
    ...(research ? RESEARCH_TOOLS : []),
  ];

  const shared = {
    prompt,
    model,
    cwd,
    additionalDirectories: [cwd],
    tools,
    toolContext,
    abortController: new AbortController(),
    record,
    onSessionId,
  };

  const mcpToken =
    provider === "CODEX" ? registerToolContext(toolContext, tools) : null;

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
    // Keep whatever the planner left in its folder, then drop the scratch.
    await workspace.close().catch(() => {});
  }
}
