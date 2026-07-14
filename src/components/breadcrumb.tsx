import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Crumb {
  label: string;
  href?: string;
}

/** Lightweight path trail. Replaces the old bordered page header bar. */
export function Breadcrumb({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center gap-1 font-mono text-xs text-fg-muted",
        className,
      )}
    >
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${i}`}>
            {item.href && !last ? (
              <Link
                href={item.href}
                className="truncate transition-colors hover:text-fg"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn("truncate", last && "font-semibold text-fg")}
                aria-current={last ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
            {!last ? (
              <ChevronRight className="size-3 shrink-0 opacity-50" />
            ) : null}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
