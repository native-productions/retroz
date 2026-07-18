import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, FileText, Trash2, Ban } from "lucide-react";
import { db } from "@/lib/db-client";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card } from "@/components/ui/ui-card";
import { ActionButton } from "@/components/ui/ui-action-button";
import { RunStatusBadge } from "@/components/run/run-status-badge";
import { Markdown } from "@/components/markdown";
import { CampaignStatusBadge } from "@/components/campaign/campaign-status-badge";
import { CampaignTabs } from "@/components/campaign/campaign-tabs";
import { CampaignPlannerViewer } from "@/components/campaign/campaign-planner-viewer";
import { CampaignCalendarEditor } from "@/components/campaign/campaign-calendar-editor";
import { CampaignAssetChecklist } from "@/components/campaign/campaign-asset-checklist";
import { CampaignScheduleForm } from "@/components/campaign/campaign-schedule-form";
import {
  runPlanner,
  cancelCampaign,
  deleteCampaign,
} from "@/lib/actions/campaign-actions";
import { toYmd, formatInTz } from "@/lib/campaign-time";
import { isPexelsConfigured } from "@/lib/pexels";

export const dynamic = "force-dynamic";

/** Muted placeholder for an empty tab. */
function TabEmpty({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-sm text-fg-muted">{children}</p>;
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      workflow: true,
      items: {
        orderBy: [{ dayIndex: "asc" }, { slotIndex: "asc" }],
        include: {
          assets: { select: { assetId: true } },
          task: {
            include: {
              runs: {
                orderBy: { createdAt: "desc" },
                select: {
                  id: true,
                  status: true,
                  createdAt: true,
                  artifacts: {
                    where: { kind: "PNG" },
                    take: 1,
                    select: { relPath: true },
                  },
                },
              },
            },
          },
        },
      },
      assetRequests: { orderBy: { label: "asc" } },
      planRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { events: { orderBy: { seq: "asc" } } },
      },
    },
  });
  if (!campaign) notFound();

  const pexelsEnabled = await isPexelsConfigured();

  const folderAssets = campaign.assetFolderId
    ? await db.asset.findMany({
        where: { folderId: campaign.assetFolderId },
        orderBy: { createdAt: "asc" },
        select: { id: true, filename: true, relPath: true, description: true },
      })
    : [];

  const latestPlan = campaign.planRuns[0];
  const editable = campaign.status === "REVIEW";
  const showSchedule = campaign.status === "REVIEW" && campaign.items.length > 0;
  const isMaterialized = ["SCHEDULED", "RUNNING", "COMPLETED", "AWAITING_ASSETS"].includes(
    campaign.status,
  );
  const canPlan = campaign.status === "DRAFT" || campaign.status === "PLANNING";
  // The planner has been kicked off at least once — gates the planner/calendar/
  // photos/schedule tabs (nothing to show there before the first run).
  const plannerStarted = Boolean(latestPlan);
  // The planner is mid-flight (AI generating tasks & briefs) — block re-running.
  const planning =
    campaign.status === "PLANNING" ||
    latestPlan?.status === "QUEUED" ||
    latestPlan?.status === "RUNNING";

  const requiredDays = campaign.items.reduce((m, i) => Math.max(m, i.dayIndex), 1);
  const requiredSlots = campaign.items.reduce(
    (m, i) => Math.max(m, i.slotIndex + 1),
    1,
  );

  const items = campaign.items.map((i) => ({
    id: i.id,
    dayIndex: i.dayIndex,
    slotIndex: i.slotIndex,
    title: i.title,
    angle: i.angle,
    instruction: i.instruction,
    caption: i.caption,
    status: i.status,
    scheduledAt: i.scheduledAt,
    // Concrete date/time once the campaign is scheduled; null while still a draft.
    scheduledLabel: i.scheduledAt
      ? formatInTz(i.scheduledAt, campaign.timezone)
      : null,
    taskRunId: i.taskRunId,
    assetIds: i.assets.map((a) => a.assetId),
    // Render runs for this item's task (newest first) with a PNG thumbnail.
    runs: (i.task?.runs ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      label: formatInTz(r.createdAt, campaign.timezone),
      thumb: r.artifacts[0]?.relPath ?? null,
    })),
  }));

  // Land the user on the tab that matches where the campaign is in its lifecycle.
  const defaultTab = editable
    ? "calendar"
    : campaign.status === "AWAITING_ASSETS"
      ? "photos"
      : isMaterialized
        ? "schedule"
        : "brief";

  // --- tab: brief (brief + run planner; splits to brief | planner runner once
  //     a plan exists, so the Planner tab is no longer needed) ---
  const briefColumn = (
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        {campaign.brief ? (
          <div className="max-h-96 overflow-y-auto">
            <Markdown>{campaign.brief}</Markdown>
          </div>
        ) : (
          <TabEmpty>No brief text.</TabEmpty>
        )}
        {campaign.briefRelPath ? (
          <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-fg-muted">
            <FileText className="size-3.5" /> {campaign.briefRelPath}
          </p>
        ) : null}
      </Card>

      {canPlan ? (
        <div>
          <ActionButton
            action={runPlanner.bind(null, campaign.id, "full", undefined)}
            variant="primary"
            size="sm"
            disabled={planning}
          >
            <Sparkles className="size-4" />{" "}
            {planning ? "Planning…" : "Run planner"}
          </ActionButton>
        </div>
      ) : null}
    </div>
  );

  const plannerColumn = latestPlan ? (
    <CampaignPlannerViewer
      planRunId={latestPlan.id}
      initialStatus={latestPlan.status}
      initialEvents={latestPlan.events.map((e) => ({
        seq: e.seq,
        type: e.type as "TEXT" | "TOOL" | "ERROR" | "SYSTEM" | "STATUS",
        payload: e.payload as Record<string, unknown>,
        ts: e.ts.toISOString(),
      }))}
    />
  ) : null;

  const briefNode = (
    <div className="flex flex-col gap-5">
      {plannerColumn ? (
        // Two views: brief on the left, live planner runner on the right.
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {briefColumn}
          {plannerColumn}
        </div>
      ) : (
        briefColumn
      )}

      {/* Danger zone */}
      <div className="mt-2 flex items-center justify-between gap-3 rounded-[var(--radius-retro)] border-2 border-danger/40 bg-danger/5 p-4">
        <div>
          <p className="font-display text-sm font-semibold">Danger zone</p>
          <p className="text-xs text-fg-muted">
            Cancel stops future runs; delete removes the campaign entirely.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status !== "CANCELLED" && campaign.status !== "COMPLETED" ? (
            <ActionButton
              action={cancelCampaign.bind(null, campaign.id)}
              confirm={{
                title: "Cancel this campaign?",
                description: "Scheduled items will not fire.",
                confirmLabel: "Cancel campaign",
                tone: "danger",
              }}
              variant="outline"
              size="sm"
            >
              <Ban className="size-4" /> Cancel
            </ActionButton>
          ) : null}
          <ActionButton
            action={deleteCampaign.bind(null, campaign.id)}
            confirm={{
              title: `Delete "${campaign.name}"?`,
              description: "This cannot be undone.",
              confirmLabel: "Delete",
              tone: "danger",
            }}
            variant="danger"
            size="sm"
          >
            <Trash2 className="size-4" /> Delete
          </ActionButton>
        </div>
      </div>
    </div>
  );

  // --- tab: calendar ---
  const calendarNode =
    campaign.items.length > 0 ? (
      <CampaignCalendarEditor
        campaignId={campaign.id}
        editable={editable}
        items={items}
      />
    ) : (
      <TabEmpty>No calendar yet. Run the planner to draft one.</TabEmpty>
    );

  // --- tab: photos ---
  const photosNode =
    campaign.assetRequests.length > 0 ? (
      <CampaignAssetChecklist
        folderId={campaign.assetFolderId}
        requests={campaign.assetRequests.map((r) => ({
          id: r.id,
          label: r.label,
          description: r.description,
          count: r.count,
          fulfilled: r.fulfilled,
        }))}
        assets={folderAssets.map((a) => ({
          id: a.id,
          filename: a.filename,
          relPath: a.relPath,
          description: a.description,
        }))}
        pexelsEnabled={pexelsEnabled}
      />
    ) : (
      <TabEmpty>No photo requests. The planner lists needed photos here.</TabEmpty>
    );

  // --- tab: schedule (form while reviewing, run status once materialized) ---
  const scheduleNode = (
    <div className="flex flex-col gap-5">
      {showSchedule ? (
        <CampaignScheduleForm
          campaignId={campaign.id}
          requiredDays={requiredDays}
          requiredSlots={requiredSlots}
          defaultTimezone={campaign.timezone}
          defaultStartDate={toYmd(new Date())}
        />
      ) : null}

      {isMaterialized ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs text-fg-muted">
            {campaign.durationDays ?? 0} day
            {campaign.durationDays === 1 ? "" : "s"} · {campaign.slotTimes.length}
            /day at {campaign.slotTimes.join(", ")} · {campaign.timezone}. Runs fire
            automatically — no separate task or schedule to manage.
          </p>
          {items.map((i) => (
            <Card
              key={i.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold">
                  D{i.dayIndex} · S{i.slotIndex + 1} · {i.title}
                </p>
                <p className="font-mono text-[10px] text-fg-muted">
                  {i.scheduledAt
                    ? formatInTz(i.scheduledAt, campaign.timezone)
                    : "not scheduled"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <RunStatusBadge status={i.status} />
                {i.taskRunId ? (
                  <Link
                    href={`/runs/${i.taskRunId}`}
                    className="font-mono text-xs underline"
                  >
                    View run
                  </Link>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {!showSchedule && !isMaterialized ? (
        <TabEmpty>
          Approve the calendar in the Calendar tab to schedule the runs.
        </TabEmpty>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader
        title={campaign.name}
        breadcrumb={[
          { label: "Workflows", href: "/workflows" },
          {
            label: campaign.workflow.name,
            href: `/workflows/${campaign.workflowId}?tab=plan`,
          },
          { label: campaign.name },
        ]}
      >
        <CampaignStatusBadge status={campaign.status} />
      </PageHeader>

      <PageBody className="flex flex-col gap-5">
        <CampaignTabs
          defaultTab={defaultTab}
          plannerStarted={plannerStarted}
          counts={{
            calendar: campaign.items.length,
            photos: campaign.assetRequests.length,
          }}
          brief={briefNode}
          calendar={calendarNode}
          photos={photosNode}
          schedule={scheduleNode}
        />
      </PageBody>
    </>
  );
}
