// Timezone-correct scheduling for campaigns. Unlike cron-expr's server-local
// setHours, campaign slots are wall-clock times in the campaign's timezone that
// must resolve to correct UTC instants regardless of the server's zone or DST.
// Dependency-free: uses Intl to read a zone's offset at a candidate instant.

interface WallParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function partsInTz(date: Date, timeZone: string): WallParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return {
    y: Number(map.year),
    mo: Number(map.month),
    d: Number(map.day),
    // Some zones render midnight as "24"; normalize to 0.
    h: map.hour === "24" ? 0 : Number(map.hour),
    mi: Number(map.minute),
    s: Number(map.second),
  };
}

function asUtcMs(p: WallParts): number {
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
}

/** Offset (ms) = what `timeZone`'s wall clock reads at `date`, minus the instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
  return asUtcMs(partsInTz(date, timeZone)) - date.getTime();
}

/**
 * Resolve a wall-clock time in `timeZone` to a UTC Date.
 *
 * @param ymd       Start calendar date, "YYYY-MM-DD".
 * @param dayOffset Days to add to the start date (0 = start day).
 * @param hm        Time of day in that zone, "HH:mm".
 * @param timeZone  IANA zone, e.g. "Asia/Jakarta".
 */
export function zonedInstant(
  ymd: string,
  dayOffset: number,
  hm: string,
  timeZone: string,
): Date {
  const [y, mo, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const [h, mi] = hm.split(":").map((x) => parseInt(x, 10));

  // Shift the calendar date by dayOffset via UTC arithmetic (no tz drift).
  const shifted = new Date(Date.UTC(y, mo - 1, d + dayOffset));
  const target: WallParts = {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    h: Number.isFinite(h) ? h : 9,
    mi: Number.isFinite(mi) ? mi : 0,
    s: 0,
  };

  // Treat the wall time as UTC, then correct by the zone's offset. Iterate once
  // more so a DST transition between guess and result resolves correctly.
  const guessMs = asUtcMs(target);
  let instant = guessMs - tzOffsetMs(new Date(guessMs), timeZone);
  instant = guessMs - tzOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Human wall-clock of an instant in a zone, e.g. "Sat 18 Jul 2026, 09:00". */
export function formatInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "YYYY-MM-DD" for a Date's UTC calendar day (used to seed a start date). */
export function toYmd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}
