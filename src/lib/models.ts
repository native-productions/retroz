import type { AgentProvider, EngineMode } from "@/generated/prisma/enums";

// Model catalog for the run-config selectors.
//
// The two LOCAL engines have fixed catalogs: Claude aliases resolve to the
// latest model in each tier via the Agent SDK, and Codex slugs come from the
// Codex CLI. The PROVIDER engine has no fixed catalog at all — its models are
// rows in ApiProviderModel, discovered from the endpoint or typed in by the
// user — so anything that needs those loads them from the database (see
// lib/provider-catalog.ts) and passes them in.
export interface ModelOption {
  value: string;
  label: string;
  hint: string;
}

/** The engines backed by a locally installed CLI. */
export type LocalProvider = "CLAUDE" | "CODEX";

export const MODEL_OPTIONS: Record<LocalProvider, ModelOption[]> = {
  CLAUDE: [
    { value: "opus", label: "Opus", hint: "Most capable — complex layouts" },
    { value: "sonnet", label: "Sonnet", hint: "Balanced — default" },
    { value: "haiku", label: "Haiku", hint: "Fastest — simple overlays" },
  ],
  CODEX: [
    { value: "gpt-5.5", label: "GPT-5.5", hint: "Most capable — complex layouts" },
    { value: "gpt-5.4", label: "GPT-5.4", hint: "Balanced — default" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 Mini", hint: "Fastest — simple overlays" },
  ],
};

export const DEFAULT_MODELS: Record<LocalProvider, string> = {
  CLAUDE: "sonnet",
  CODEX: "gpt-5.4",
};

export const PROVIDER_OPTIONS: { value: LocalProvider; label: string; hint: string }[] = [
  { value: "CLAUDE", label: "Claude Code", hint: "Local Claude Code login or API key" },
  { value: "CODEX", label: "Codex", hint: "Local Codex CLI login (~/.codex)" },
];

const PROVIDER_LABELS: Record<AgentProvider, string> = {
  CLAUDE: "Claude Code",
  CODEX: "Codex",
  OPENAI_COMPAT: "API provider",
};

export function providerLabel(provider: AgentProvider): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/**
 * Which tool the agent uses to look at an image, or null when it cannot see at
 * all. Claude reads images through its own Read tool; Codex and the
 * OpenAI-compatible engine use view_image. A text-only provider model gets null,
 * and the prompt tells the agent to work from the asset descriptions instead of
 * naming a tool that was never registered for it.
 */
export function imageToolName(
  provider: AgentProvider,
  supportsVision = true,
): string | null {
  if (provider === "CLAUDE") return "Read";
  if (provider === "CODEX") return "view_image";
  return supportsVision ? "view_image" : null;
}

export const CODEX_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];

/** Model groups for the LOCAL selectors. PROVIDER groups come from the database. */
export const MODEL_GROUPS = PROVIDER_OPTIONS.map((p) => ({
  label: p.label,
  options: MODEL_OPTIONS[p.value],
}));

/** Which local provider's catalog a model value belongs to, or null. */
export function providerOfModel(value?: string | null): LocalProvider | null {
  if (!value) return null;
  for (const [provider, options] of Object.entries(MODEL_OPTIONS)) {
    if (options.some((m) => m.value === value)) return provider as LocalProvider;
  }
  return null;
}

/**
 * Display name for a stored model value. Pass the catalog's `labels` map to
 * resolve PROVIDER-mode values — those are ApiProviderModel row ids, which
 * would otherwise render as a raw cuid.
 */
export function modelLabel(
  value?: string | null,
  labels?: Record<string, string>,
): string {
  if (!value) return "Default";
  if (labels?.[value]) return labels[value];
  for (const options of Object.values(MODEL_OPTIONS)) {
    const match = options.find((m) => m.value === value);
    if (match) return match.label;
  }
  return value;
}

export interface ResolvedProviderModel {
  provider: AgentProvider;
  /**
   * A catalog alias in LOCAL mode, an ApiProviderModel **row id** in PROVIDER
   * mode. Empty when PROVIDER mode has no usable model configured — the
   * executor turns that into a failed run with a readable message rather than
   * spawning an engine that cannot work.
   */
  model: string;
}

/**
 * Resolve which engine + model a run uses.
 *
 * PROVIDER mode ignores every Claude/Codex override and vice versa. That is
 * deliberate: a task pinned to "sonnet" must keep working after the app is
 * switched to an API provider, and must still say "sonnet" when it is switched
 * back. Overrides from the inactive side are skipped, never rewritten.
 */
export function resolveProviderModel(input: {
  engineMode: EngineMode;
  pinnedProvider?: AgentProvider | null;
  candidates: Array<string | null | undefined>;
  claudeDefault: string;
  codexDefault: string;
  /** Valid ApiProviderModel ids, used to recognise a PROVIDER-mode override. */
  providerModelIds?: Set<string>;
  defaultProviderModelId?: string | null;
}): ResolvedProviderModel {
  const {
    engineMode,
    pinnedProvider,
    candidates,
    claudeDefault,
    codexDefault,
    providerModelIds,
    defaultProviderModelId,
  } = input;

  if (engineMode === "PROVIDER") {
    const known = providerModelIds ?? new Set<string>();
    for (const candidate of candidates) {
      if (candidate && known.has(candidate)) {
        return { provider: "OPENAI_COMPAT", model: candidate };
      }
    }
    const fallback =
      defaultProviderModelId && known.has(defaultProviderModelId)
        ? defaultProviderModelId
        : "";
    return { provider: "OPENAI_COMPAT", model: fallback };
  }

  // LOCAL mode: the engine is derived from the chosen model (a Codex model runs
  // on Codex, and so on). A pinned provider from a campaign or task wins.
  const pinnedLocal =
    pinnedProvider === "CLAUDE" || pinnedProvider === "CODEX"
      ? pinnedProvider
      : null;
  if (pinnedLocal) {
    const model = resolveModel(pinnedLocal, [
      ...candidates,
      pinnedLocal === "CODEX" ? codexDefault : claudeDefault,
    ]);
    return { provider: pinnedLocal, model };
  }
  for (const candidate of candidates) {
    const provider = providerOfModel(candidate);
    if (provider) return { provider, model: candidate as string };
  }
  return { provider: "CLAUDE", model: claudeDefault };
}

/**
 * Pick the first candidate that belongs to the provider's catalog, else the
 * provider default. Lets a task keep e.g. a Claude override without breaking
 * runs when the app is switched to Codex.
 */
export function resolveModel(
  provider: LocalProvider,
  candidates: Array<string | null | undefined>,
): string {
  const catalog = MODEL_OPTIONS[provider];
  for (const candidate of candidates) {
    if (candidate && catalog.some((m) => m.value === candidate)) return candidate;
  }
  return DEFAULT_MODELS[provider];
}
