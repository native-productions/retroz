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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/ui-tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/ui-select";
import {
  MODEL_OPTIONS,
  CODEX_REASONING_EFFORTS,
  type CodexReasoningEffort,
} from "@/lib/models";
import { updateSettings } from "@/lib/actions/settings-actions";
import { isTimeZone } from "@/lib/validation";
import { formatInTz } from "@/lib/campaign-time";
import { ProvidersCard } from "@/components/settings/providers-card";
import type { ProviderView } from "@/lib/actions/provider-actions";
import { cn } from "@/lib/cn";

const EFFORT_LABELS: Record<CodexReasoningEffort, string> = {
  low: "Low — fastest",
  medium: "Medium — default",
  high: "High — deeper reasoning",
  xhigh: "Extra high — hardest layouts",
};

interface SettingsValues {
  engineMode: "LOCAL" | "PROVIDER";
  defaultModel: string;
  claudeAuthMode: "SUBSCRIPTION" | "API_KEY";
  codexModel: string;
  codexReasoningEffort: string;
  defaultProviderModelId: string | null;
  pexelsApiKey: string;
  tavilyApiKey: string;
  timezone: string;
}

export function SettingsForm({
  initial,
  providers,
  apiKeyPresent,
  codexAuthPresent,
}: {
  initial: SettingsValues;
  providers: ProviderView[];
  apiKeyPresent: boolean;
  codexAuthPresent: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<SettingsValues>(initial);
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Provider changes save themselves; these fields do not. Showing the save bar
  // only when something actually differs keeps that distinction visible instead
  // of leaving a permanently armed button on screen.
  const dirty = (Object.keys(initial) as (keyof SettingsValues)[]).some(
    (k) => values[k] !== initial[k],
  );

  const providerModels = providers.filter((p) => p.models.length > 0);

  // A zone only means something if the runtime can format with it, so the field
  // checks itself as you type rather than throwing on save. The clock preview
  // waits for mount: the server and the browser would render different minutes.
  const zone = values.timezone.trim();
  const zoneValid = isTimeZone(zone);
  const [zoneNow, setZoneNow] = React.useState<string | null>(null);
  React.useEffect(() => {
    setZoneNow(zoneValid ? formatInTz(new Date(), zone) : null);
  }, [zone, zoneValid]);
  const zonePreview = zoneNow ? `Right now that reads ${zoneNow}.` : undefined;

  async function save() {
    if (!zoneValid) return;
    setState("saving");
    await updateSettings({
      ...values,
      pexelsApiKey: values.pexelsApiKey.trim(),
      tavilyApiKey: values.tavilyApiKey.trim(),
      timezone: zone,
    });
    setState("saved");
    // Every model selector in the app reads the catalog loaded by the shell, so
    // a mode change has to invalidate it, not just this page.
    router.refresh();
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <Tabs defaultValue="engine" className="flex max-w-3xl flex-col">
      <TabsList>
        <TabsTrigger value="engine">Engine</TabsTrigger>
        <TabsTrigger value="providers">
          Providers
          {providers.length > 0 ? (
            <span className="ml-1.5 opacity-60">{providers.length}</span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
      </TabsList>

      {/* --- Engine ------------------------------------------------------- */}
      <TabsContent value="engine" className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Where runs execute</CardTitle>
            <CardDescription>
              The two are exclusive. Only the active side&apos;s models are
              offered anywhere in the app; overrides from the other side are kept
              and ignored until you switch back.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeChoice
                active={values.engineMode === "LOCAL"}
                title="Local"
                hint="Claude Code or Codex, installed and logged in on this machine."
                onSelect={() => set("engineMode", "LOCAL")}
              />
              <ModeChoice
                active={values.engineMode === "PROVIDER"}
                title="Provider"
                hint="Gemini, or any OpenAI-compatible endpoint, on your own API key."
                onSelect={() => set("engineMode", "PROVIDER")}
              />
            </div>
          </CardContent>
        </Card>

        {values.engineMode === "LOCAL" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Claude Code</CardTitle>
                <CardDescription>
                  How this local app talks to Claude.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <Field
                  label="Default model"
                  hint="Fallback when nothing (task, workflow, campaign) picks a model."
                >
                  <Select
                    value={values.defaultModel}
                    onValueChange={(v) => set("defaultModel", v)}
                  >
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
                    values.claudeAuthMode === "API_KEY"
                      ? apiKeyPresent
                        ? "ANTHROPIC_API_KEY detected in environment."
                        : "⚠ No ANTHROPIC_API_KEY set. Add it to .env before running."
                      : "Uses your local Claude Code login (subscription). No API key needed."
                  }
                >
                  <Select
                    value={values.claudeAuthMode}
                    onValueChange={(v) =>
                      set("claudeAuthMode", v as SettingsValues["claudeAuthMode"])
                    }
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

            <Card>
              <CardHeader>
                <CardTitle>Codex</CardTitle>
                <CardDescription>
                  {codexAuthPresent
                    ? "Codex CLI login detected (~/.codex)."
                    : "⚠ No Codex login found. Run `codex login` in a terminal first."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <Field
                  label="Default model"
                  hint="Used when a task, workflow, or campaign picks Codex."
                >
                  <Select
                    value={values.codexModel}
                    onValueChange={(v) => set("codexModel", v)}
                  >
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
                  <Select
                    value={values.codexReasoningEffort}
                    onValueChange={(v) => set("codexReasoningEffort", v)}
                  >
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
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Default model</CardTitle>
              <CardDescription>
                Used when nothing (task, workflow, project, campaign) picks one.
                Project skills are Claude-only and are not available in this mode.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {providerModels.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  No provider models yet. Add an endpoint on the Providers tab and
                  fetch its models.
                </p>
              ) : (
                <Field
                  label="Model"
                  hint="Set on the Providers tab if you want a different endpoint."
                >
                  <Select
                    value={values.defaultProviderModelId ?? ""}
                    onValueChange={(v) => set("defaultProviderModelId", v)}
                  >
                    <SelectTrigger className="max-w-lg">
                      <SelectValue placeholder="Pick a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {providerModels.map((p) => (
                        <SelectGroup key={p.id}>
                          <SelectLabel>{p.name}</SelectLabel>
                          {p.models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.modelId}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      {/* --- Providers ---------------------------------------------------- */}
      <TabsContent value="providers">
        <ProvidersCard providers={providers} />
      </TabsContent>

      {/* --- Integrations ------------------------------------------------- */}
      <TabsContent value="integrations" className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Pexels</CardTitle>
            <CardDescription>
              Stock photos for the asset picker. Get a free key at pexels.com/api.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field
              label="API key"
              hint={
                values.pexelsApiKey.trim()
                  ? "Pexels search is enabled across every asset picker."
                  : "Empty. The Pexels tab stays locked until a key is saved."
              }
            >
              <Input
                type="password"
                value={values.pexelsApiKey}
                onChange={(e) => set("pexelsApiKey", e.target.value)}
                placeholder="Paste your Pexels API key"
                autoComplete="off"
                className="max-w-lg font-mono"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tavily</CardTitle>
            <CardDescription>
              Web research, so the agent checks a fact instead of inventing it.
              Get a key at tavily.com.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field
              label="API key"
              hint={
                values.tavilyApiKey.trim()
                  ? "Research is available. Each workflow, campaign and chat message sets its own on / auto / off."
                  : "Empty. The web tools stay hidden from every agent until a key is saved."
              }
            >
              <Input
                type="password"
                value={values.tavilyApiKey}
                onChange={(e) => set("tavilyApiKey", e.target.value)}
                placeholder="Paste your Tavily API key"
                autoComplete="off"
                className="max-w-lg font-mono"
              />
            </Field>
          </CardContent>
        </Card>
      </TabsContent>

      {/* --- Schedule ----------------------------------------------------- */}
      <TabsContent value="schedule" className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Timezone</CardTitle>
            <CardDescription>
              Every scheduled time is read and written in this zone: bundle
              publish slots on the Calendar, cron run times, and campaign posts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field
              label="IANA zone"
              hint={zonePreview}
              error={zoneValid ? undefined : "Not a zone this machine knows."}
            >
              <Input
                value={values.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                placeholder="Asia/Jakarta"
                autoComplete="off"
                spellCheck={false}
                className="max-w-lg font-mono"
              />
            </Field>
          </CardContent>
        </Card>
      </TabsContent>

      <SaveBar
        visible={dirty || state !== "idle"}
        state={state}
        blocked={!zoneValid}
        onSave={save}
        onDiscard={() => setValues(initial)}
      />
    </Tabs>
  );
}

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
        "flex flex-col gap-1 rounded-[var(--radius-retro)] border-2 p-3 text-left outline-none",
        "transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-border bg-primary text-primary-fg shadow-hard-sm"
          : "border-border-soft bg-surface hover:border-border hover:bg-surface-2",
      )}
    >
      <span className="font-display font-semibold">{title}</span>
      <span className={cn("text-xs", active ? "opacity-80" : "text-fg-muted")}>
        {hint}
      </span>
    </button>
  );
}

/**
 * Sticky footer that appears once something is unsaved.
 *
 * It rides the page rather than sitting at the bottom of a long form, so the
 * save action is reachable from whichever tab changed something.
 */
function SaveBar({
  visible,
  state,
  blocked,
  onSave,
  onDiscard,
}: {
  visible: boolean;
  state: "idle" | "saving" | "saved";
  /** A field is invalid — saving would only throw, so the button stays off. */
  blocked?: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "sticky bottom-4 z-10 mt-5 flex items-center justify-between gap-4",
        "rounded-[var(--radius-retro)] border-2 border-border bg-surface px-4 py-3 shadow-hard",
        "transition-[opacity,transform] duration-200 ease-out",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <p className="font-mono text-xs uppercase tracking-wide text-fg-muted">
        {state === "saved"
          ? "Settings saved"
          : blocked
            ? "Fix the highlighted field"
            : "Unsaved changes"}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={state !== "idle"}
        >
          Discard
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={state !== "idle" || Boolean(blocked)}
        >
          {state === "saving" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : state === "saved" ? (
            <Check className="size-4" />
          ) : (
            <Save className="size-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
