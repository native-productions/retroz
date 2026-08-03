import { zonedInstant } from "@/lib/campaign-time";

export type Cadence = "DAILY" | "WEEKLY" | "MONTHLY";

/** Build a node-cron expression from cadence + HH:mm. */
export function buildCronExpr(cadence: Cadence, timeOfDay: string): string {
  const [h, m] = timeOfDay.split(":").map((x) => parseInt(x, 10));
  const hh = Number.isFinite(h) ? h : 9;
  const mm = Number.isFinite(m) ? m : 0;
  switch (cadence) {
    case "DAILY":
      return `${mm} ${hh} * * *`;
    case "WEEKLY":
      return `${mm} ${hh} * * 1`; // Mondays
    case "MONTHLY":
      return `${mm} ${hh} 1 * *`; // 1st of month
  }
}

/** Rough next-occurrence for display (server local time). */
export function computeNextRun(
  cadence: Cadence,
  timeOfDay: string,
  from: Date,
): Date {
  const [h, m] = timeOfDay.split(":").map((x) => parseInt(x, 10));
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0);

  if (cadence === "DAILY") {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }
  if (cadence === "WEEKLY") {
    // advance to next Monday (getDay: 0=Sun..1=Mon)
    while (next.getDay() !== 1 || next <= from) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }
  // MONTHLY — 1st of month
  next.setDate(1);
  if (next <= from) next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Every occurrence of a cadence inside `[from, to)`, as real instants.
 *
 * Unlike `computeNextRun` this respects the schedule's timezone — it resolves
 * each candidate day through `zonedInstant`, the same DST-safe path campaigns
 * use — because the Calendar plots these next to campaign slots and bundle
 * publish times, and a one-hour drift would land a run on the wrong cell.
 */
export function expandCadence(
  cadence: Cadence,
  timeOfDay: string,
  timeZone: string,
  from: Date,
  to: Date,
): Date[] {
  const out: Date[] = [];
  // Walk calendar days in UTC and let zonedInstant do the wall-clock work; the
  // window is widened by a day on each side so a zone offset cannot drop the
  // first or last occurrence.
  const cursor = new Date(from.getTime() - 86_400_000);
  const end = to.getTime() + 86_400_000;

  while (cursor.getTime() <= end) {
    const y = cursor.getUTCFullYear();
    const mo = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();

    const fires =
      cadence === "DAILY" ||
      (cadence === "WEEKLY" && cursor.getUTCDay() === 1) ||
      (cadence === "MONTHLY" && d === 1);

    if (fires) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const at = zonedInstant(`${y}-${pad(mo)}-${pad(d)}`, 0, timeOfDay, timeZone);
      if (at >= from && at < to) out.push(at);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function cadenceLabel(cadence: Cadence, timeOfDay: string): string {
  const t = timeOfDay;
  switch (cadence) {
    case "DAILY":
      return `Every day at ${t}`;
    case "WEEKLY":
      return `Every Monday at ${t}`;
    case "MONTHLY":
      return `1st of month at ${t}`;
  }
}
