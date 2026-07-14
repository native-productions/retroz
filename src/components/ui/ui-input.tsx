import * as React from "react";
import { cn } from "@/lib/cn";

const baseField =
  "w-full bg-surface text-fg border-2 border-border rounded-[var(--radius-retro)] px-3 text-sm placeholder:text-fg-muted/60 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(baseField, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(baseField, "min-h-24 py-2 font-mono leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";
