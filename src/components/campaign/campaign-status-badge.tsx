import { Badge } from "@/components/ui/ui-badge";

type Tone = "primary" | "secondary" | "accent" | "surface" | "muted" | "danger";

const MAP: Record<string, { tone: Tone; label: string }> = {
  DRAFT: { tone: "muted", label: "Draft" },
  PLANNING: { tone: "secondary", label: "Planning" },
  REVIEW: { tone: "accent", label: "Review" },
  AWAITING_ASSETS: { tone: "surface", label: "Awaiting assets" },
  SCHEDULED: { tone: "primary", label: "Scheduled" },
  RUNNING: { tone: "secondary", label: "Running" },
  COMPLETED: { tone: "primary", label: "Completed" },
  CANCELLED: { tone: "danger", label: "Cancelled" },
};

export function CampaignStatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { tone: "surface" as Tone, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
