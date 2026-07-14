"use client";

import * as React from "react";
import { Save, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Field } from "@/components/ui/ui-label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import { MODEL_OPTIONS } from "@/lib/models";
import { updateSettings } from "@/lib/actions/settings-actions";

export function SettingsForm({
  initial,
  apiKeyPresent,
}: {
  initial: { defaultModel: string; claudeAuthMode: "SUBSCRIPTION" | "API_KEY" };
  apiKeyPresent: boolean;
}) {
  const [defaultModel, setDefaultModel] = React.useState(initial.defaultModel);
  const [authMode, setAuthMode] = React.useState(initial.claudeAuthMode);
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setState("saving");
    await updateSettings({ defaultModel, claudeAuthMode: authMode });
    setState("saved");
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      <Field
        label="Default model"
        hint="Used when a task or workflow does not pick its own."
      >
        <Select value={defaultModel} onValueChange={setDefaultModel}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((m) => (
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
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SUBSCRIPTION">
              Subscription (local Claude Code login)
            </SelectItem>
            <SelectItem value="API_KEY">API key (ANTHROPIC_API_KEY)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

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
