import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/ui-button";

/**
 * Month paging through the URL rather than client state, so a month is a link
 * someone can keep: the page stays server-rendered and the back button works.
 */
export function CalendarMonthNav({
  monthLabel,
  prev,
  next,
  current,
  atCurrent,
}: {
  monthLabel: string;
  prev: string;
  next: string;
  /** "YYYY-MM" of the month today falls in. */
  current: string;
  atCurrent: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="mr-1 font-display text-sm font-semibold tabular-nums">
        {monthLabel}
      </p>
      <Button asChild variant="outline" size="icon" title="Previous month">
        <Link href={`/calendar?m=${prev}`} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Link>
      </Button>
      <Button asChild variant="outline" size="icon" title="Next month">
        <Link href={`/calendar?m=${next}`} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Link>
      </Button>
      {atCurrent ? null : (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/calendar?m=${current}`}>Today</Link>
        </Button>
      )}
    </div>
  );
}
