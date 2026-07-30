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
import {
  RESEARCH_MODES,
  RESEARCH_LABELS,
  RESEARCH_HINTS,
  RESEARCH_LOCKED_HINT,
  type ResearchMode,
} from "@/lib/research";
import { updateCampaign } from "@/lib/actions/campaign-actions";

/** Governs whether the planner may look things up before drafting the calendar. */
export function CampaignResearchSelect({
  campaignId,
  initialResearchMode,
  researchAvailable,
}: {
  campaignId: string;
  initialResearchMode: ResearchMode;
  /** False when no Tavily key is saved — the picker locks. */
  researchAvailable: boolean;
}) {
  const [research, setResearch] = React.useState<ResearchMode>(
    initialResearchMode,
  );
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setState("saving");
    await updateCampaign({ id: campaignId, researchMode: research });
    setState("saved");
    setTimeout(() => setState("idle"), 1600);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field
        label="Web research"
        hint={
          researchAvailable ? RESEARCH_HINTS[research] : RESEARCH_LOCKED_HINT
        }
        className="w-72"
      >
        <Select
          value={research}
          onValueChange={(v) => setResearch(v as ResearchMode)}
          disabled={!researchAvailable}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESEARCH_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {RESEARCH_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Button
        size="sm"
        variant="outline"
        onClick={save}
        disabled={!researchAvailable || state === "saving"}
      >
        {state === "saving" ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : state === "saved" ? (
          <Check className="size-4" />
        ) : (
          <Save className="size-4" />
        )}
        {state === "saved" ? "Saved" : "Save"}
      </Button>
    </div>
  );
}
