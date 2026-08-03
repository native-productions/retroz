import type { CalendarLayer } from "@/lib/calendar-types";

// Four systems share one grid, so each needs an identity that survives being
// three pixels tall. A filled square in the layer's brand colour carries it —
// never a coloured edge on the chip, which reads as decoration at this size.

export const LAYER_META: Record<
  CalendarLayer,
  { label: string; dot: string; plural: string }
> = {
  bundle: { label: "Bundle", plural: "bundles", dot: "bg-primary" },
  schedule: { label: "Run", plural: "scheduled runs", dot: "bg-secondary" },
  campaign: { label: "Campaign", plural: "campaign posts", dot: "bg-accent" },
  run: { label: "Ran", plural: "past runs", dot: "bg-fg-muted" },
};

export const LAYER_ORDER: CalendarLayer[] = [
  "bundle",
  "schedule",
  "campaign",
  "run",
];
