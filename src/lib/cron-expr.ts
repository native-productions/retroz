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
