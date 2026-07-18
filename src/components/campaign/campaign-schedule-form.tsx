"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
import { approveCampaign } from "@/lib/actions/campaign-actions";

const DEFAULT_TIMES = ["09:00", "13:00", "17:00", "19:00", "21:00", "22:00"];

export function CampaignScheduleForm({
  campaignId,
  requiredDays,
  requiredSlots,
  defaultTimezone,
  defaultStartDate,
}: {
  campaignId: string;
  requiredDays: number;
  requiredSlots: number;
  defaultTimezone: string;
  defaultStartDate: string; // YYYY-MM-DD
}) {
  const router = useRouter();
  const [startDate, setStartDate] = React.useState(defaultStartDate);
  const [durationDays, setDurationDays] = React.useState(
    Math.max(1, requiredDays),
  );
  const [timezone, setTimezone] = React.useState(defaultTimezone);
  const [slotTimes, setSlotTimes] = React.useState<string[]>(
    Array.from({ length: Math.max(1, requiredSlots) }, (_, i) => DEFAULT_TIMES[i] ?? "12:00"),
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function setSlot(i: number, v: string) {
    setSlotTimes((prev) => prev.map((t, idx) => (idx === i ? v : t)));
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await approveCampaign({
        campaignId,
        startDate,
        durationDays,
        slotsPerDay: slotTimes.length,
        slotTimes,
        timezone,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="retro-card flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" htmlFor="cmp-start">
          <Input
            id="cmp-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Duration (days)" htmlFor="cmp-days" hint="Max 7">
          <Input
            id="cmp-days"
            type="number"
            min={requiredDays}
            max={7}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
          />
        </Field>
      </div>

      <Field label="Timezone" htmlFor="cmp-tz">
        <Input
          id="cmp-tz"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Slot times ({slotTimes.length}/day)
        </p>
        <div className="grid grid-cols-3 gap-2">
          {slotTimes.map((t, i) => (
            <Field key={i} label={`Slot ${i + 1}`}>
              <Input
                type="time"
                value={t}
                onChange={(e) => setSlot(i, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-[var(--radius-retro)] border-2 border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={loading}>
          {loading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <>
              <CalendarCheck className="size-4" /> Approve &amp; schedule
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
