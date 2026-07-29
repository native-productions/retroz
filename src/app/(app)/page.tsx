import { getDashboardData } from "@/lib/dashboard-queries";
import { DashMasthead } from "@/components/dashboard/dash-masthead";
import { DashCounters } from "@/components/dashboard/dash-counters";
import { DashContactSheet } from "@/components/dashboard/dash-contact-sheet";
import { DashTokenChart } from "@/components/dashboard/dash-token-chart";
import { DashRunsChart } from "@/components/dashboard/dash-runs-chart";
import { DashRecent, DashRunTicker } from "@/components/dashboard/dash-recent";

export const dynamic = "force-dynamic";

/**
 * The front door. Unlike every other page it skips `PageHeader` for its own
 * masthead, and it is the one surface that runs the full brand palette: each
 * band owns a hue, and the contact sheet supplies the rest of the colour from
 * the app's own output.
 */
export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="flex flex-col gap-8 px-8 pb-10 pt-6">
      <DashMasthead runsToday={data.runsToday} />

      <DashCounters counters={data.counters} />

      <DashContactSheet items={data.gallery} />

      {/* Usage runs wider than outcomes: fourteen days of columns need the
          room, six workflow rows do not. The split lives entirely on the
          container — a per-child `col-span` is one class away from collapsing
          each panel into a single 1/12 track. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <DashTokenChart facets={data.tokens} />
        <DashRunsChart rows={data.workflowRuns} />
      </div>

      <DashRecent
        sessions={data.sessions}
        workflows={data.workflows}
        campaigns={data.campaigns}
      />

      <DashRunTicker runs={data.runs} />
    </div>
  );
}
