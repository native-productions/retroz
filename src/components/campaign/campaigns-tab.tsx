import Link from "next/link";
import { CalendarRange, CalendarClock, ListChecks } from "lucide-react";
import { db } from "@/lib/db-client";
import { EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/ui-card";
import { CampaignStatusBadge } from "@/components/campaign/campaign-status-badge";
import { CampaignCreateDialog } from "@/components/campaign/campaign-create-dialog";

export async function CampaignsTab({ workflowId }: { workflowId: string }) {
  const campaigns = await db.campaign.findMany({
    where: { workflowId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
        </p>
        <CampaignCreateDialog workflowId={workflowId} />
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="size-6" />}
          title="No campaigns yet"
          description="Plan a multi-day content calendar from a brief. The AI drafts the posts and tells you which photos to upload."
          action={
            <CampaignCreateDialog workflowId={workflowId} variant="secondary" />
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {campaigns.map((c) => (
            <Card
              key={c.id}
              className="flex items-center justify-between gap-3 p-4"
            >
              <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1">
                <p className="truncate font-display font-semibold hover:underline">
                  {c.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-fg-muted font-mono">
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="size-3.5" />
                    {c._count.items} item{c._count.items === 1 ? "" : "s"}
                  </span>
                  {c.durationDays ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3.5" />
                      {c.durationDays}d · {c.slotsPerDay ?? 1}/day
                    </span>
                  ) : null}
                </div>
              </Link>
              <CampaignStatusBadge status={c.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
