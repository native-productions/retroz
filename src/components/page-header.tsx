import * as React from "react";
import { cn } from "@/lib/cn";
import { Breadcrumb, type Crumb } from "@/components/breadcrumb";

/**
 * Borderless page heading. A breadcrumb leads, then the title + actions sit in
 * the normal scroll flow — no sticky bar, no bottom border.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  children,
  className,
}: {
  title: string;
  description?: string;
  breadcrumb?: Crumb[];
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 px-8 pt-6", className)}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <Breadcrumb items={breadcrumb} />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
          ) : null}
        </div>
        {children ? (
          <div className="flex items-center gap-2">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

export function PageBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 px-8 py-6", className)} {...props} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="retro-card grid place-items-center gap-3 p-12 text-center">
      {icon ? (
        <div className="grid size-12 place-items-center rounded-full border-2 border-border bg-surface-2 text-fg-muted">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="font-display text-lg font-semibold">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
