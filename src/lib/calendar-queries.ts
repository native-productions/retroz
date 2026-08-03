import { db } from "@/lib/db-client";
import { mediaUrl } from "@/lib/media";
import { getAppTimezone } from "@/lib/app-timezone";
import { zonedInstant, zonedTime, zonedYmd } from "@/lib/campaign-time";
import { expandCadence, type Cadence } from "@/lib/cron-expr";
import type {
  CalendarDay,
  CalendarEntry,
  CalendarLayer,
  CalendarMonth,
  CalendarStrip,
  CalendarStripDay,
  CalendarUnscheduled,
} from "@/lib/calendar-types";

// Read side of the Calendar. Four unrelated systems say "this happens at a
// time" — bundles carry a publish slot, cron schedules recur, campaign items
// are materialized, and task runs are history — so this module is the one place
// that resolves all four against the app timezone and buckets them into days.
//
// `collectEntries` is the whole merge; the month grid and the dashboard strip
// are two framings of the same window.

const DAY_MS = 86_400_000;
const CELLS = 42; // six Monday-first rows, the only layout that never reflows
const STRIP_DAYS = 14;
const STRIP_UPCOMING = 5;

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of a UTC-walked calendar date. */
function ymdOf(utcMs: number): string {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Midnight-to-midnight UTC anchor for a "YYYY-MM-DD", for calendar-date maths. */
function utcOf(ymd: string): number {
  const [y, mo, d] = ymd.split("-").map(Number);
  return Date.UTC(y, mo - 1, d);
}

/** Parse "YYYY-MM" into a valid month, falling back to the current one. */
export function parseMonthParam(
  raw: string | undefined,
  timezone: string,
): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year >= 1970 && year <= 9999 && month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  const [y, m] = zonedYmd(new Date(), timezone).split("-");
  return { year: Number(y), month: Number(m) };
}

function shiftMonth(year: number, month: number, by: number): string {
  const d = new Date(Date.UTC(year, month - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/**
 * Everything scheduled inside `[from, to)`, from all four systems, formatted in
 * the app timezone and sorted by instant.
 */
async function collectEntries(
  from: Date,
  to: Date,
  timezone: string,
  now: Date,
): Promise<CalendarEntry[]> {
  const [bundles, schedules, campaignItems, runs] = await Promise.all([
    db.workBundle.findMany({
      where: { publishAt: { gte: from, lt: to } },
      orderBy: { publishAt: "asc" },
      select: {
        id: true,
        name: true,
        publishAt: true,
        projectId: true,
        project: { select: { name: true } },
        _count: { select: { items: true } },
        items: {
          take: 1,
          orderBy: { order: "asc" },
          select: { artifact: { select: { id: true, relPath: true } } },
        },
      },
    }),
    db.schedule.findMany({
      where: { enabled: true },
      select: {
        id: true,
        cadence: true,
        timeOfDay: true,
        timezone: true,
        workflowId: true,
        workflow: { select: { name: true } },
        tasks: { select: { name: true } },
      },
    }),
    db.campaignItem.findMany({
      where: { scheduledAt: { gte: from, lt: to } },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        campaignId: true,
        campaign: { select: { name: true } },
      },
    }),
    db.taskRun.findMany({
      // Work runs are chat turns, not scheduled content — they would bury
      // everything else on their day.
      where: { createdAt: { gte: from, lt: to }, trigger: { not: "work" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        task: { select: { name: true, workflow: { select: { name: true } } } },
      },
    }),
  ]);

  const entries: CalendarEntry[] = [];

  for (const b of bundles) {
    const at = b.publishAt as Date;
    const cover = b.items[0]?.artifact ?? null;
    entries.push({
      id: `bundle:${b.id}`,
      layer: "bundle",
      day: zonedYmd(at, timezone),
      atISO: at.toISOString(),
      timeLabel: zonedTime(at, timezone),
      title: b.name,
      subtitle: `${b.project.name} · ${b._count.items} slide${b._count.items === 1 ? "" : "s"}`,
      status: null,
      thumb: cover ? mediaUrl(cover.relPath, cover.id) : null,
      href: `/work/p/${b.projectId}/bundles/${b.id}`,
      bundleId: b.id,
    });
  }

  for (const s of schedules) {
    // Occurrences are projected in the *schedule's* zone — that is when node-cron
    // actually fires — then bucketed in the app zone like everything else.
    const fires = expandCadence(
      s.cadence as Cadence,
      s.timeOfDay,
      s.timezone,
      from,
      to,
    );
    const extra = s.tasks.length > 1 ? ` +${s.tasks.length - 1}` : "";
    const title = s.tasks.length
      ? `${s.tasks[0].name}${extra}`
      : "Scheduled run";

    for (const at of fires) {
      // An occurrence that has already come round is history, and the TaskRun it
      // produced is on the same day — showing both would double-count it.
      if (at.getTime() <= now.getTime()) continue;
      entries.push({
        id: `schedule:${s.id}:${at.toISOString()}`,
        layer: "schedule",
        day: zonedYmd(at, timezone),
        atISO: at.toISOString(),
        timeLabel: zonedTime(at, timezone),
        title,
        subtitle: s.workflow.name,
        status: null,
        thumb: null,
        href: `/workflows/${s.workflowId}`,
        bundleId: null,
      });
    }
  }

  for (const item of campaignItems) {
    const at = item.scheduledAt as Date;
    entries.push({
      id: `campaign:${item.id}`,
      layer: "campaign",
      day: zonedYmd(at, timezone),
      atISO: at.toISOString(),
      timeLabel: zonedTime(at, timezone),
      title: item.title,
      subtitle: item.campaign.name,
      status: item.status,
      thumb: null,
      href: `/campaigns/${item.campaignId}`,
      bundleId: null,
    });
  }

  for (const run of runs) {
    entries.push({
      id: `run:${run.id}`,
      layer: "run",
      day: zonedYmd(run.createdAt, timezone),
      atISO: run.createdAt.toISOString(),
      timeLabel: zonedTime(run.createdAt, timezone),
      title: run.task.name,
      subtitle: run.task.workflow.name,
      status: run.status,
      thumb: null,
      href: `/runs/${run.id}`,
      bundleId: null,
    });
  }

  return entries.sort((a, b) => a.atISO.localeCompare(b.atISO));
}

/** Entries keyed by their day, each bucket already in time order. */
function bucketByDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.day);
    if (list) list.push(entry);
    else byDay.set(entry.day, [entry]);
  }
  return byDay;
}

/**
 * The whole month grid, every scheduled thing on it, and the bundles still
 * waiting for a date.
 */
export async function getCalendarMonth(
  year: number,
  month: number,
): Promise<CalendarMonth> {
  const timezone = await getAppTimezone();
  const now = new Date();
  const todayYmd = zonedYmd(now, timezone);

  // Grid runs Monday-first from the Monday on or before the 1st. Days are walked
  // as UTC calendar dates and only ever turned into instants through
  // `zonedInstant`, so the window is exactly midnight-to-midnight *in the zone*.
  const firstUtc = Date.UTC(year, month - 1, 1);
  const back = (new Date(firstUtc).getUTCDay() + 6) % 7;
  const gridStartUtc = firstUtc - back * DAY_MS;

  const cellYmds = Array.from({ length: CELLS }, (_, i) =>
    ymdOf(gridStartUtc + i * DAY_MS),
  );
  const from = zonedInstant(cellYmds[0], 0, "00:00", timezone);
  const to = zonedInstant(cellYmds[CELLS - 1], 1, "00:00", timezone);

  const [entries, unscheduledRows] = await Promise.all([
    collectEntries(from, to, timezone, now),
    db.workBundle.findMany({
      where: { publishAt: null },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        name: true,
        projectId: true,
        project: { select: { name: true } },
        _count: { select: { items: true } },
        items: {
          take: 1,
          orderBy: { order: "asc" },
          select: { artifact: { select: { id: true, relPath: true } } },
        },
      },
    }),
  ]);

  const byDay = bucketByDay(entries);

  const days: CalendarDay[] = cellYmds.map((day) => ({
    day,
    dayNumber: Number(day.slice(8)),
    inMonth: Number(day.slice(0, 4)) === year && Number(day.slice(5, 7)) === month,
    isToday: day === todayYmd,
    isPast: day < todayYmd,
    entries: byDay.get(day) ?? [],
  }));

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < CELLS; i += 7) weeks.push(days.slice(i, i + 7));

  const counts: Record<CalendarLayer, number> = {
    bundle: 0,
    schedule: 0,
    campaign: 0,
    run: 0,
  };
  for (const day of days) {
    if (!day.inMonth) continue;
    for (const entry of day.entries) counts[entry.layer] += 1;
  }

  const unscheduled: CalendarUnscheduled[] = unscheduledRows.map((b) => {
    const cover = b.items[0]?.artifact ?? null;
    return {
      id: b.id,
      name: b.name,
      projectName: b.project.name,
      slideCount: b._count.items,
      thumb: cover ? mediaUrl(cover.relPath, cover.id) : null,
      href: `/work/p/${b.projectId}/bundles/${b.id}`,
    };
  });

  return {
    year,
    month,
    monthLabel: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
      "en-GB",
      { month: "long", year: "numeric", timeZone: "UTC" },
    ),
    timezone,
    prev: shiftMonth(year, month, -1),
    next: shiftMonth(year, month, 1),
    current: todayYmd.slice(0, 7),
    weeks,
    unscheduled,
    counts,
  };
}

/**
 * A short forward window for the dashboard: today plus the next two weeks, and
 * the handful of things happening soonest. Deliberately not a month — the front
 * page answers "what is coming", and the month view answers "when exactly".
 */
export async function getCalendarStrip(
  days = STRIP_DAYS,
): Promise<CalendarStrip> {
  const timezone = await getAppTimezone();
  const now = new Date();
  const todayYmd = zonedYmd(now, timezone);
  const todayUtc = utcOf(todayYmd);

  const from = zonedInstant(todayYmd, 0, "00:00", timezone);
  const to = zonedInstant(todayYmd, days, "00:00", timezone);
  const entries = await collectEntries(from, to, timezone, now);
  const byDay = bucketByDay(entries);

  const nowISO = now.toISOString();
  const cells: CalendarStripDay[] = Array.from({ length: days }, (_, i) => {
    const utc = todayUtc + i * DAY_MS;
    const day = ymdOf(utc);
    const date = new Date(utc);
    return {
      day,
      dayNumber: date.getUTCDate(),
      // Every cell is inside the window by construction, and none is behind
      // today — the two flags only carry meaning in the month grid.
      inMonth: true,
      isToday: day === todayYmd,
      isPast: false,
      entries: byDay.get(day) ?? [],
      weekdayLabel: date.toLocaleDateString("en-GB", {
        weekday: "short",
        timeZone: "UTC",
      }),
      monthLabel: date.toLocaleDateString("en-GB", {
        month: "short",
        timeZone: "UTC",
      }),
    };
  });

  return {
    timezone,
    month: todayYmd.slice(0, 7),
    days: cells,
    upcoming: entries
      .filter((e) => e.atISO >= nowISO)
      .slice(0, STRIP_UPCOMING),
  };
}
