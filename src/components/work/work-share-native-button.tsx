"use client";

import * as React from "react";
import { LoaderCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/ui-button";

/** Answered once per page load: building a probe File on every render is waste. */
let fileShareSupport: boolean | null = null;

/**
 * Whether this browser can put files in the share sheet at all. There is no
 * capability flag for it — the only honest test is asking `canShare` with a
 * file in hand.
 */
function canShareFiles(): boolean {
  if (fileShareSupport === null) {
    try {
      const probe = new File([new Uint8Array()], "probe.png", {
        type: "image/png",
      });
      fileShareSupport = Boolean(navigator.canShare?.({ files: [probe] }));
    } catch {
      fileShareSupport = false;
    }
  }
  return fileShareSupport;
}

/** Nothing to subscribe to: support cannot change while the page is open. */
const noop = () => () => {};

/**
 * Hands the slides to the OS share sheet.
 *
 * This is the one path that reaches Instagram directly: on iOS the sheet lists
 * Instagram and Photos, so a scanned share page can go from render to post
 * without a download step. Desktop browsers mostly cannot share files, so the
 * button only appears where it works — the zip stays the fallback everywhere
 * else, and is never replaced by it.
 */
export function WorkShareNativeButton({
  slides,
  title,
  className,
  variant = "primary",
}: {
  /** Slide URLs in carousel order — the share sheet keeps this order. */
  slides: { url: string; filename: string }[];
  title: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  // Read after hydration, never on the server: `navigator` does not exist
  // there, and the server snapshot of `false` keeps the first paint matching.
  const supported = React.useSyncExternalStore(noop, canShareFiles, () => false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function share() {
    if (busy || slides.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const files: File[] = [];
      for (const slide of slides) {
        const response = await fetch(slide.url);
        if (!response.ok) throw new Error(`Could not read ${slide.filename}`);
        const blob = await response.blob();
        files.push(
          new File([blob], slide.filename, {
            type: blob.type || "image/png",
          }),
        );
      }

      if (!navigator.canShare?.({ files })) {
        // Some browsers cap how many files one share may carry.
        throw new Error("This browser will not share these files.");
      }
      await navigator.share({ files, title });
    } catch (cause) {
      // A cancelled sheet is a decision, not a failure — say nothing.
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Sharing failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        onClick={share}
        disabled={busy || slides.length === 0}
        className="w-full"
      >
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Share2 className="size-4" />
        )}
        {busy ? "Preparing…" : `Share ${slides.length} slides`}
      </Button>
      {error ? (
        <p className="mt-2 text-center text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
