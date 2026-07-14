import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 border-2 border-border rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono uppercase tracking-wide",
  {
    variants: {
      tone: {
        primary: "bg-primary text-primary-fg",
        secondary: "bg-secondary text-secondary-fg",
        accent: "bg-accent text-accent-fg",
        surface: "bg-surface-2 text-fg",
        muted: "bg-transparent text-fg-muted border-border-soft",
        danger: "bg-danger text-white",
      },
    },
    defaultVariants: { tone: "surface" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
