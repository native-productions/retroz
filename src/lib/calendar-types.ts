// View models for the Calendar. Same contract as `work-queries.ts`: every date
// is already formatted in the app timezone by the time it leaves the server, so
// the client never re-derives a day or a label and can never disagree with it.

/** Which system put an entry on the calendar. Drives its glyph and colour. */
export type CalendarLayer = "bundle" | "schedule" | "campaign" | "run";

export interface CalendarEntry {
  /** Unique across layers — a projected cron occurrence has no row of its own. */
  id: string;
  layer: CalendarLayer;
  /** "YYYY-MM-DD" in the app timezone; the cell this belongs to. */
  day: string;
  /** The instant, so a drag can move the day and keep the time of day. */
  atISO: string;
  /** "09:00" in the app timezone. */
  timeLabel: string;
  title: string;
  subtitle: string;
  /** Run or campaign-item status, uppercase; null for the other layers. */
  status: string | null;
  thumb: string | null;
  href: string | null;
  /** Bundles are the only entries whose date the calendar owns. */
  bundleId: string | null;
}

export interface CalendarDay {
  day: string;
  dayNumber: number;
  /** Leading and trailing cells belong to the neighbouring month. */
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  entries: CalendarEntry[];
}

/** A strip cell also names its weekday, since it has no column header to sit under. */
export interface CalendarStripDay extends CalendarDay {
  /** "Mon". */
  weekdayLabel: string;
  /** "Aug" — rendered only where the month turns over inside the strip. */
  monthLabel: string;
}

/** The dashboard's forward window: the next two weeks at a glance. */
export interface CalendarStrip {
  timezone: string;
  /** "YYYY-MM" of today, for the link into the month view. */
  month: string;
  /** Today first, one cell per day. */
  days: CalendarStripDay[];
  /** The nearest few entries in the window, soonest first. */
  upcoming: CalendarEntry[];
}

/** A bundle with no publish date, offered in the side panel to be dragged in. */
export interface CalendarUnscheduled {
  id: string;
  name: string;
  projectName: string;
  slideCount: number;
  thumb: string | null;
  href: string;
}

export interface CalendarMonth {
  year: number;
  /** 1-12. */
  month: number;
  /** "August 2026". */
  monthLabel: string;
  timezone: string;
  /** "YYYY-MM" targets for the month nav. */
  prev: string;
  next: string;
  current: string;
  /** Six rows of seven days, Monday first. */
  weeks: CalendarDay[][];
  unscheduled: CalendarUnscheduled[];
  counts: Record<CalendarLayer, number>;
}
