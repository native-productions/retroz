"use client";

import * as React from "react";
import { Save, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Field } from "@/components/ui/ui-label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/ui-card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import {
  MODEL_OPTIONS,
  PROVIDER_OPTIONS,
  CODEX_REASONING_EFFORTS,
  type CodexReasoningEffort,
} from "@/lib/models";
import { updateSettings } from "@/lib/actions/settings-actions";

const EFFORT_LABELS: Record<CodexReasoningEffort, string> = {
  low: "Low — fastest",
  medium: "Medium — default",
  high: "High — deeper reasoning",
  xhigh: "Extra high — hardest layouts",
};

export function SettingsForm({
  initial,
  apiKeyPresent,
  codexAuthPresent,
}: {
  initial: {
    provider: "CLAUDE" | "CODEX";
    defaultModel: string;
    claudeAuthMode: "SUBSCRIPTION" | "API_KEY";
    codexModel: string;
    codexReasoningEffort: string;
  };
  apiKeyPresent: boolean;
  codexAuthPresent: boolean;
}) {
  const [provider, setProvider] = React.useState(initial.provider);
  const [defaultModel, setDefaultModel] = React.useState(initial.defaultModel);
  const [authMode, setAuthMode] = React.useState(initial.claudeAuthMode);
  const [codexModel, setCodexModel] = React.useState(initial.codexModel);
  const [codexEffort, setCodexEffort] = React.useState(
    initial.codexReasoningEffort,
  );
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setState("saving");
    await updateSettings({
      provider,
      defaultModel,
      claudeAuthMode: authMode,
      codexModel,
      codexReasoningEffort: codexEffort,
    });
    setState("saved");
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Engine</CardTitle>
          <CardDescription>
            Which local coding agent produces your content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field
            label="Provider"
            hint={PROVIDER_OPTIONS.find((p) => p.value === provider)?.hint}
          >
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as typeof provider)}
            >
              <SelectTrigger className="max-w-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label} — {p.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {provider === "CLAUDE" ? (
        <Card>
          <CardHeader>
            <CardTitle>Claude Code</CardTitle>
            <CardDescription>How this local app talks to Claude.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field
              label="Default model"
              hint="Used when a task or workflow does not pick its own."
            >
              <Select value={defaultModel} onValueChange={setDefaultModel}>
                <SelectTrigger className="max-w-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.CLAUDE.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label} — {m.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Claude auth"
              hint={
                authMode === "API_KEY"
                  ? apiKeyPresent
                    ? "ANTHROPIC_API_KEY detected in environment."
                    : "⚠ No ANTHROPIC_API_KEY set — add it to .env before running."
                  : "Uses your local Claude Code login (subscription). No API key needed."
              }
            >
              <Select
                value={authMode}
                onValueChange={(v) => setAuthMode(v as typeof authMode)}
              >
                <SelectTrigger className="max-w-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUBSCRIPTION">
                    Subscription (local Claude Code login)
                  </SelectItem>
                  <SelectItem value="API_KEY">
                    API key (ANTHROPIC_API_KEY)
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Codex</CardTitle>
            <CardDescription>
              {codexAuthPresent
                ? "Codex CLI login detected (~/.codex)."
                : "⚠ No Codex login found — run `codex login` in a terminal first."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field
              label="Default model"
              hint="Used when a task or workflow does not pick its own."
            >
              <Select value={codexModel} onValueChange={setCodexModel}>
                <SelectTrigger className="max-w-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.CODEX.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label} — {m.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Reasoning effort"
              hint="How hard the model thinks before acting. Medium fits most runs."
            >
              <Select value={codexEffort} onValueChange={setCodexEffort}>
                <SelectTrigger className="max-w-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CODEX_REASONING_EFFORTS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {EFFORT_LABELS[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
      )}

      <Button onClick={save} disabled={state === "saving"} className="w-fit">
        {state === "saving" ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : state === "saved" ? (
          <Check className="size-4" />
        ) : (
          <Save className="size-4" />
        )}
        {state === "saved" ? "Saved" : "Save settings"}
      </Button>
    </div>
  );
}
