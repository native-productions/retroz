"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/ui-button";
import { useConfirm, type ConfirmOptions } from "@/components/confirm-provider";

/**
 * Runs a bound server action inside a transition. If `confirm` is set, shows the
 * modal confirm dialog first (never native window.confirm). Redirecting actions
 * (delete → list, run → viewer) just work.
 */
export function ActionButton({
  action,
  confirm,
  children,
  disabled,
  onDone,
  ...props
}: {
  action: () => Promise<void>;
  confirm?: string | ConfirmOptions;
  onDone?: () => void;
} & Omit<ButtonProps, "onClick">) {
  const [pending, start] = React.useTransition();
  const askConfirm = useConfirm();

  async function handle() {
    if (confirm) {
      const opts: ConfirmOptions =
        typeof confirm === "string"
          ? { title: confirm, tone: "danger" }
          : confirm;
      const ok = await askConfirm(opts);
      if (!ok) return;
    }
    start(async () => {
      await action();
      onDone?.();
    });
  }

  return (
    <Button {...props} disabled={disabled || pending} onClick={handle}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : children}
    </Button>
  );
}
