import { PageHeader, PageBody } from "@/components/page-header";
import { CalendarBoard } from "@/components/calendar/calendar-board";
import { CalendarMonthNav } from "@/components/calendar/calendar-month-nav";
import { getAppTimezone } from "@/lib/app-timezone";
import { getCalendarMonth, parseMonthParam } from "@/lib/calendar-queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Calendar — Retroz" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const [{ m }, timezone] = await Promise.all([searchParams, getAppTimezone()]);
  const { year, month } = parseMonthParam(m, timezone);
  const data = await getCalendarMonth(year, month);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="When everything happens: bundles you plan to post, runs your schedules and campaigns will fire, and what already ran."
        breadcrumb={[{ label: "Calendar" }]}
      >
        <CalendarMonthNav
          monthLabel={data.monthLabel}
          prev={data.prev}
          next={data.next}
          current={data.current}
          atCurrent={
            data.current === `${year}-${String(month).padStart(2, "0")}`
          }
        />
      </PageHeader>
      <PageBody>
        <CalendarBoard month={data} />
      </PageBody>
    </>
  );
}
