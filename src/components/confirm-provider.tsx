"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/ui-dialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Promise-based confirm modal. Replaces native window.confirm everywhere. */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

interface State {
  open: boolean;
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State | null>(null);

  const confirm = React.useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, opts, resolve });
    });
  }, []);

  function settle(result: boolean) {
    state?.resolve(result);
    setState((s) => (s ? { ...s, open: false } : s));
  }

  const opts = state?.opts;
  const danger = opts?.tone !== "default";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={Boolean(state?.open)}
        onOpenChange={(o) => {
          if (!o) settle(false);
        }}
      >
        <DialogContent className="w-[min(94vw,26rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {danger ? (
                <span className="grid size-7 place-items-center rounded-[var(--radius-retro)] border-2 border-border bg-danger text-white">
                  <TriangleAlert className="size-4" />
                </span>
              ) : null}
              {opts?.title ?? "Are you sure?"}
            </DialogTitle>
            {opts?.description ? (
              <DialogDescription>{opts.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogBody className="pt-0" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => settle(false)}>
              {opts?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              onClick={() => settle(true)}
              autoFocus
            >
              {opts?.confirmLabel ?? (danger ? "Delete" : "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
