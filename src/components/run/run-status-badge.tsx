import { Badge } from "@/components/ui/ui-badge";

type Status = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

const TONE: Record<Status, React.ComponentProps<typeof Badge>["tone"]> = {
  QUEUED: "muted",
  RUNNING: "accent",
  DONE: "primary",
  FAILED: "danger",
  CANCELLED: "muted",
};

export function RunStatusBadge({ status }: { status: string }) {
  const s = (status as Status) in TONE ? (status as Status) : "QUEUED";
  return <Badge tone={TONE[s]}>{status}</Badge>;
}
