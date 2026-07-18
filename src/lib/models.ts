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

export function modelLabel(value?: string | null): string {
  if (!value) return "Default";
  for (const options of Object.values(MODEL_OPTIONS)) {
    const match = options.find((m) => m.value === value);
    if (match) return match.label;
  }
  return value;
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
