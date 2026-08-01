import "server-only";
import { db } from "@/lib/db-client";
import { resolveProviderModel } from "@/lib/models";
import {
  resolveApiModel,
  resolveDefaultProviderModelId,
  type ResolvedApiModel,
} from "@/lib/provider-catalog";
import { runClaudeAgent } from "@/lib/claude-backend";
import { runCodexAgent } from "@/lib/codex-backend";
import { runApiAgent } from "@/lib/api-backend";
import type { AgentRunInput, AgentRunResult } from "@/lib/agent-backend";
import type { AgentProvider } from "@/generated/prisma/enums";

/**
 * The one place that decides which engine runs a task and then starts it.
 *
 * All three executors (scheduled runs, Work turns, campaign planning) resolved
 * the engine and branched on it themselves, which meant three copies of the
 * same ternary drifting apart. They now share this.
 */

export interface EngineSelection {
  provider: AgentProvider;
  /** Catalog alias in LOCAL mode, ApiProviderModel row id in PROVIDER mode. */
  model: string;
  /** Populated only for OPENAI_COMPAT. */
  apiModel: ResolvedApiModel | null;
  /** Null when the selection is runnable, otherwise why it is not. */
  error: string | null;
}

type EngineSettings = {
  engineMode: "LOCAL" | "PROVIDER";
  defaultModel: string;
  codexModel: string;
  defaultProviderModelId: string | null;
};

/**
 * Resolve settings + overrides into a runnable engine. Never throws: an
 * unrunnable configuration comes back as `error` so the caller can fail the run
 * with a message the user can act on instead of a stack trace.
 */
export async function selectEngine(input: {
  settings: EngineSettings;
  pinnedProvider?: AgentProvider | null;
  candidates: Array<string | null | undefined>;
}): Promise<EngineSelection> {
  const { settings } = input;

  // Only PROVIDER mode needs the id set, and only to tell a live provider model
  // override apart from a stale Claude/Codex one.
  const providerModelIds =
    settings.engineMode === "PROVIDER"
      ? new Set(
          (
            await db.apiProviderModel.findMany({
              where: { provider: { enabled: true } },
              select: { id: true },
            })
          ).map((m) => m.id),
        )
      : undefined;

  // The same fallback the selectors show, so a run never disagrees with the
  // model the user was looking at when they started it.
  const defaultProviderModelId =
    settings.engineMode === "PROVIDER"
      ? await resolveDefaultProviderModelId(settings.defaultProviderModelId)
      : null;

  const { provider, model } = resolveProviderModel({
    engineMode: settings.engineMode,
    pinnedProvider: input.pinnedProvider,
    candidates: input.candidates,
    claudeDefault: settings.defaultModel,
    codexDefault: settings.codexModel,
    providerModelIds,
    defaultProviderModelId,
  });

  if (provider !== "OPENAI_COMPAT") {
    return { provider, model, apiModel: null, error: null };
  }

  if (!model) {
    return {
      provider,
      model,
      apiModel: null,
      error:
        "No API provider model is available. Add a provider in Settings and fetch its models.",
    };
  }

  const apiModel = await resolveApiModel(model);
  if (!apiModel) {
    return {
      provider,
      model,
      apiModel: null,
      error:
        "The selected provider model is unavailable — it may have been deleted, disabled, or its stored API key can no longer be decrypted. Re-check it in Settings.",
    };
  }

  return { provider, model, apiModel, error: null };
}

/** Everything a backend needs beyond the shared AgentRunInput. */
export interface DispatchOptions {
  selection: EngineSelection;
  shared: Omit<AgentRunInput, "baseTools"> & { baseTools?: string[] };
  codexReasoningEffort: string;
  claudeAuthMode: "SUBSCRIPTION" | "API_KEY";
  /** Claude-only: which project skills to load. */
  skills: string[] | "all";
  /** Codex-only: the per-run HTTP MCP token, null on the other engines. */
  mcpToken?: string | null;
  /** Codex-only: the port the MCP route is served on. */
  port?: string;
}

const DEFAULT_BASE_TOOLS = ["Read", "Write", "Glob", "Grep", "Bash"];

/** Start the run on whichever engine `selection` resolved to. */
export async function dispatchAgentRun(
  options: DispatchOptions,
): Promise<AgentRunResult> {
  const { selection, shared } = options;

  switch (selection.provider) {
    case "CODEX":
      return runCodexAgent({
        ...shared,
        model: selection.model,
        reasoningEffort: options.codexReasoningEffort,
        mcpServerUrl: `http://127.0.0.1:${options.port ?? process.env.PORT ?? "3020"}/api/mcp/${options.mcpToken}`,
      });

    case "OPENAI_COMPAT": {
      const api = selection.apiModel;
      if (!api) throw new Error(selection.error ?? "Provider model unavailable.");
      return runApiAgent({
        ...shared,
        // The row id selected the model; the endpoint wants its slug.
        model: api.modelId,
        providerName: api.providerName,
        protocol: api.protocol,
        baseUrl: api.baseUrl,
        apiKey: api.apiKey,
        capabilities: api.capabilities,
        supportsVision: api.supportsVision,
        inputPricePerM: api.inputPricePerM,
        outputPricePerM: api.outputPricePerM,
        baseTools: shared.baseTools ?? DEFAULT_BASE_TOOLS,
      });
    }

    default:
      return runClaudeAgent({
        ...shared,
        model: selection.model,
        skills: options.skills,
        stripApiKey: options.claudeAuthMode === "SUBSCRIPTION",
      });
  }
}
