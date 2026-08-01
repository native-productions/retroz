"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { ProvidersCard } from "@/components/settings/providers-card";
import type { ProviderView } from "@/lib/actions/provider-actions";
import { cn } from "@/lib/cn";

const EFFORT_LABELS: Record<CodexReasoningEffort, string> = {
  low: "Low — fastest",
  medium: "Medium — default",
  high: "High — deeper reasoning",
  xhigh: "Extra high — hardest layouts",
};

/** One half of the Local / Provider switch. */
function ModeChoice({
  active,
  title,
  hint,
  onSelect,
}: {
  active: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-1 border-2 border-border p-3 text-left transition-colors",
        active ? "bg-primary text-primary-fg" : "bg-surface hover:bg-surface-2",
      )}
    >
      <span className="font-display font-semibold">{title}</span>
      <span
        className={cn("text-xs", active ? "opacity-80" : "text-fg-muted")}
      >
        {hint}
      </span>
    </button>
  );
}

export function SettingsForm({
  initial,
  providers,
  apiKeyPresent,
  codexAuthPresent,
}: {
  initial: {
    engineMode: "LOCAL" | "PROVIDER";
    defaultModel: string;
    claudeAuthMode: "SUBSCRIPTION" | "API_KEY";
    codexModel: string;
    codexReasoningEffort: string;
    defaultProviderModelId: string | null;
    pexelsApiKey: string;
    tavilyApiKey: string;
  };
  providers: ProviderView[];
  apiKeyPresent: boolean;
  codexAuthPresent: boolean;
}) {
  const router = useRouter();
  const [engineMode, setEngineMode] = React.useState(initial.engineMode);
  const [defaultModel, setDefaultModel] = React.useState(initial.defaultModel);
  const [authMode, setAuthMode] = React.useState(initial.claudeAuthMode);
  const [codexModel, setCodexModel] = React.useState(initial.codexModel);
  const [codexEffort, setCodexEffort] = React.useState(
    initial.codexReasoningEffort,
  );
  const [providerModelId, setProviderModelId] = React.useState(
    initial.defaultProviderModelId,
  );
  const [pexelsApiKey, setPexelsApiKey] = React.useState(initial.pexelsApiKey);
  const [tavilyApiKey, setTavilyApiKey] = React.useState(initial.tavilyApiKey);
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setState("saving");
    await updateSettings({
      engineMode,
      defaultModel,
      claudeAuthMode: authMode,
      codexModel,
      codexReasoningEffort: codexEffort,
      defaultProviderModelId: providerModelId,
      pexelsApiKey: pexelsApiKey.trim(),
      tavilyApiKey: tavilyApiKey.trim(),
    });
    setState("saved");
    // Every model selector in the app reads the catalog loaded by the shell, so
    // a mode change has to invalidate it, not just this page.
    router.refresh();
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {/* Engine mode — the two sides are exclusive */}
      <Card>
        <CardHeader>
          <CardTitle>Engine</CardTitle>
          <CardDescription>
            Where runs execute. The two are exclusive: only the active side&apos;s
            models are offered anywhere in the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <ModeChoice
              active={engineMode === "LOCAL"}
              title="Local"
              hint="Claude Code or Codex, installed and logged in on this machine."
              onSelect={() => setEngineMode("LOCAL")}
            />
            <ModeChoice
              active={engineMode === "PROVIDER"}
              title="Provider"
              hint="Gemini, or any OpenAI-compatible endpoint, on your own API key."
              onSelect={() => setEngineMode("PROVIDER")}
            />
          </div>
          <p className="text-xs text-fg-muted">
            {engineMode === "LOCAL"
              ? "The engine for a run follows the model picked on its workflow, task, or campaign — a Claude model runs on Claude Code, a Codex model on Codex."
              : "Every run goes to the provider model picked on its workflow, task, or campaign, falling back to the default below. Project skills are Claude-only and are not available in this mode."}
          </p>
        </CardContent>
      </Card>

      {engineMode === "PROVIDER" ? (
        <ProvidersCard
          providers={providers}
          defaultModelId={providerModelId}
          onDefaultModelChange={setProviderModelId}
        />
      ) : null}

      {engineMode === "LOCAL" ? (
        <>
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
        </>
      ) : null}

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

      {/* Tavily */}
      <Card>
        <CardHeader>
          <CardTitle>Tavily</CardTitle>
          <CardDescription>
            Web research, so the agent checks a fact instead of inventing it. Get
            a key at tavily.com.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field
            label="API key"
            hint={
              tavilyApiKey.trim()
                ? "Research is available. Each workflow, campaign and chat message sets its own on / auto / off."
                : "Empty — the web tools stay hidden from every agent until a key is saved."
            }
          >
            <Input
              type="password"
              value={tavilyApiKey}
              onChange={(e) => setTavilyApiKey(e.target.value)}
              placeholder="Paste your Tavily API key"
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
