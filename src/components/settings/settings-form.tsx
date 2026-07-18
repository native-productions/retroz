"use client";

import * as React from "react";
import { Save, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
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
    defaultModel: string;
    claudeAuthMode: "SUBSCRIPTION" | "API_KEY";
    codexModel: string;
    codexReasoningEffort: string;
    pexelsApiKey: string;
  };
  apiKeyPresent: boolean;
  codexAuthPresent: boolean;
}) {
  const [defaultModel, setDefaultModel] = React.useState(initial.defaultModel);
  const [authMode, setAuthMode] = React.useState(initial.claudeAuthMode);
  const [codexModel, setCodexModel] = React.useState(initial.codexModel);
  const [codexEffort, setCodexEffort] = React.useState(
    initial.codexReasoningEffort,
  );
  const [pexelsApiKey, setPexelsApiKey] = React.useState(initial.pexelsApiKey);
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setState("saving");
    await updateSettings({
      defaultModel,
      claudeAuthMode: authMode,
      codexModel,
      codexReasoningEffort: codexEffort,
      pexelsApiKey: pexelsApiKey.trim(),
    });
    setState("saved");
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <p className="text-sm text-fg-muted">
        Both engines stay configured. The engine for a run follows the model you
        pick on its workflow, task, or campaign — a Claude model runs on Claude
        Code, a Codex model on Codex. Claude is the default when nothing sets one.
      </p>

      {/* Claude Code */}
      <Card>
        <CardHeader>
          <CardTitle>Claude Code</CardTitle>
          <CardDescription>How this local app talks to Claude.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field
            label="Default model"
            hint="Fallback when nothing (task, workflow, campaign) picks a model."
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

      {/* Codex */}
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
            hint="Used when a task, workflow, or campaign picks Codex."
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

      {/* Pexels */}
      <Card>
        <CardHeader>
          <CardTitle>Pexels</CardTitle>
          <CardDescription>
            Stock photos for the asset picker. Get a free key at
            pexels.com/api.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field
            label="API key"
            hint={
              pexelsApiKey.trim()
                ? "Pexels search is enabled across every asset picker."
                : "Empty — the Pexels tab stays locked until a key is saved."
            }
          >
            <Input
              type="password"
              value={pexelsApiKey}
              onChange={(e) => setPexelsApiKey(e.target.value)}
              placeholder="Paste your Pexels API key"
              autoComplete="off"
              className="max-w-lg font-mono"
            />
          </Field>
        </CardContent>
      </Card>

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
