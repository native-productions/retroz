import type { AgentProvider } from "@/generated/prisma/enums";

// Model catalog for the run-config selectors, keyed by engine provider.
// Claude aliases resolve to the latest model in each tier via the Agent SDK;
// Codex slugs come from the Codex CLI model catalog.
export interface ModelOption {
  value: string;
  label: string;
  hint: string;
}

export const MODEL_OPTIONS: Record<AgentProvider, ModelOption[]> = {
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

export const DEFAULT_MODELS: Record<AgentProvider, string> = {
  CLAUDE: "sonnet",
  CODEX: "gpt-5.4",
};

export const PROVIDER_OPTIONS: { value: AgentProvider; label: string; hint: string }[] = [
  { value: "CLAUDE", label: "Claude Code", hint: "Local Claude Code login or API key" },
  { value: "CODEX", label: "Codex", hint: "Local Codex CLI login (~/.codex)" },
];

export function providerLabel(provider: AgentProvider): string {
  return PROVIDER_OPTIONS.find((p) => p.value === provider)?.label ?? provider;
}

export const CODEX_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];

// Model groups for task/workflow override selectors. Overrides may name a model
// from either provider; resolveModel ignores the ones that don't match the
// active provider at run time.
export const MODEL_GROUPS = PROVIDER_OPTIONS.map((p) => ({
  label: p.label,
  options: MODEL_OPTIONS[p.value],
}));

/** Which provider's catalog a model value belongs to, or null if unknown. */
export function providerOfModel(value?: string | null): AgentProvider | null {
  if (!value) return null;
  for (const [provider, options] of Object.entries(MODEL_OPTIONS)) {
    if (options.some((m) => m.value === value)) return provider as AgentProvider;
  }
  return null;
}

export function modelLabel(value?: string | null): string {
  if (!value) return "Default";
  for (const options of Object.values(MODEL_OPTIONS)) {
    const match = options.find((m) => m.value === value);
    if (match) return match.label;
  }
  return value;
}

/**
 * Resolve which engine + model a run uses. There is no global provider toggle:
 * the engine is derived from the chosen model (a Codex model → Codex, etc.).
 * A pinned provider (campaign/task override) wins; otherwise the first candidate
 * model that maps to a catalog decides; failing everything, Claude is the default.
 */
export function resolveProviderModel(input: {
  pinnedProvider?: AgentProvider | null;
  candidates: Array<string | null | undefined>;
  claudeDefault: string;
  codexDefault: string;
}): { provider: AgentProvider; model: string } {
  const { pinnedProvider, candidates, claudeDefault, codexDefault } = input;
  if (pinnedProvider) {
    const model = resolveModel(pinnedProvider, [
      ...candidates,
      pinnedProvider === "CODEX" ? codexDefault : claudeDefault,
    ]);
    return { provider: pinnedProvider, model };
  }
  for (const c of candidates) {
    const p = providerOfModel(c);
    if (p) return { provider: p, model: c as string };
  }
  return { provider: "CLAUDE", model: claudeDefault };
}

/**
 * Pick the first candidate that belongs to the provider's catalog, else the
 * provider default. Lets a task keep e.g. a Claude override without breaking
 * runs when the app is switched to Codex.
 */
export function resolveModel(
  provider: AgentProvider,
  candidates: Array<string | null | undefined>,
): string {
  const catalog = MODEL_OPTIONS[provider];
  for (const candidate of candidates) {
    if (candidate && catalog.some((m) => m.value === candidate)) return candidate;
  }
  return DEFAULT_MODELS[provider];
}
