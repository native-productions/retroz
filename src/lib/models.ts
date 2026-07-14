// Model catalog for the run-config selectors. Aliases resolve to the latest
// model in each tier via the Claude Code binary / Agent SDK.
export interface ModelOption {
  value: string;
  label: string;
  hint: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { value: "opus", label: "Opus", hint: "Most capable — complex layouts" },
  { value: "sonnet", label: "Sonnet", hint: "Balanced — default" },
  { value: "haiku", label: "Haiku", hint: "Fastest — simple overlays" },
];

export const DEFAULT_MODEL = "sonnet";

export function modelLabel(value?: string | null): string {
  if (!value) return "Default";
  return MODEL_OPTIONS.find((m) => m.value === value)?.label ?? value;
}
