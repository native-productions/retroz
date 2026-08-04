"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Download,
  FolderOpen,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/ui-dialog";
import { WorkShareNativeButton } from "@/components/work/work-share-native-button";
import { useConfirm } from "@/components/confirm-provider";
import {
  createBundleShare,
  getBundleShare,
  reissueBundleShareUrl,
  revealBundleForAirdrop,
  revokeBundleShare,
  type BundleShareState,
} from "@/lib/actions/work-share-actions";

/**
 * Getting a finished carousel onto the phone, three ways, in the order they are
 * worth trying: scan a QR code and save from the phone, AirDrop the files off
 * this machine, or hand them to the OS share sheet.
 */
export function WorkShareDialog({
  bundleId,
  bundleName,
  slides,
  open,
  onOpenChange,
}: {
  bundleId: string;
  bundleName: string;
  /** Slides in carousel order, for the share sheet on this machine. */
  slides: { url: string; filename: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const confirm = useConfirm();
  const [share, setShare] = React.useState<BundleShareState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [reveal, setReveal] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Read on mount rather than from the page payload: LAN addresses change when
  // the laptop moves between networks, and a stale one produces a QR code that
  // silently goes nowhere. The caller mounts this only while it is open, so
  // every reopen is a fresh read and there is no stale state to clear.
  React.useEffect(() => {
    let live = true;
    getBundleShare(bundleId)
      .then((next) => {
        if (live) setShare(next);
      })
      .catch(() => {
        if (live) setError("Could not read this machine's network addresses.");
      });
    return () => {
      live = false;
    };
  }, [bundleId]);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const link = () =>
    guard(async () => setShare(await createBundleShare(bundleId)));

  const pickHost = (host: string) =>
    guard(async () => setShare(await reissueBundleShareUrl(bundleId, host)));

  async function drop() {
    const ok = await confirm({
      title: "Revoke this link?",
      description:
        "Any phone that has already scanned the QR code loses access. Sharing again issues a new link.",
      confirmLabel: "Revoke link",
      tone: "danger",
    });
    if (!ok) return;
    await guard(async () => setShare(await revokeBundleShare(bundleId)));
  }

  async function copy() {
    if (!share?.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the link stays selectable either way.
    }
  }

  function airdrop() {
    return guard(async () => {
      const result = await revealBundleForAirdrop(bundleId);
      setReveal(
        result.opened
          ? `${result.count} slides ready in Finder — select them all, then Share › AirDrop.`
          : `${result.count} slides written to ${result.folder}`,
      );
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share &ldquo;{bundleName}&rdquo;</DialogTitle>
          <DialogDescription>
            Get the slides onto a phone, in carousel order, ready to post.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          <section className="flex flex-col gap-2.5">
            <SectionLabel icon={<QrCode className="size-3.5" />}>
              Scan with your phone
            </SectionLabel>

            {!share ? (
              <Loading />
            ) : share.hosts.length === 0 ? (
              <Note>
                This machine has no network address a phone could reach. Connect
                it to Wi-Fi, then reopen this dialog.
              </Note>
            ) : !share.url ? (
              <>
                <p className="text-xs leading-relaxed text-fg-muted">
                  Creates a link this bundle can be opened at from any device on
                  the same Wi-Fi. No login on the phone — the link itself is the
                  key, and you can revoke it here.
                </p>
                <Button onClick={link} disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <QrCode className="size-4" />
                  )}
                  Create share link
                </Button>
              </>
            ) : (
              <>
                <div
                  aria-label="QR code for the share link"
                  className="mx-auto w-44 rounded-[var(--radius-retro)] border-2 border-border bg-white p-2 shadow-hard-sm [&>svg]:h-auto [&>svg]:w-full"
                  // The SVG is built on the server by qrcode-generator from the
                  // link above — no user input reaches it.
                  dangerouslySetInnerHTML={{ __html: share.qr ?? "" }}
                />

                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface-2 px-2 py-1.5 font-mono text-[11px]">
                    {share.url}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copy}
                    title="Copy link"
                    aria-label="Copy link"
                    className="size-9 shrink-0"
                  >
                    {copied ? (
                      <Check className="size-4 text-primary" strokeWidth={3} />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>

                {share.hosts.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
                      Address
                    </span>
                    {share.hosts.map((host) => {
                      const active = share.url?.includes(`//${host}:`);
                      return (
                        <button
                          key={host}
                          type="button"
                          onClick={() => pickHost(host)}
                          disabled={busy}
                          className={
                            "rounded-full border-2 px-2 py-0.5 font-mono text-[10px] transition-colors " +
                            (active
                              ? "border-border bg-primary text-primary-fg"
                              : "border-border-soft text-fg-muted hover:text-fg")
                          }
                        >
                          {host}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-muted">
                  <Wifi className="mt-px size-3.5 shrink-0" />
                  The phone must be on the same Wi-Fi. If the page does not load,
                  try another address above.
                </p>

                <button
                  type="button"
                  onClick={drop}
                  disabled={busy}
                  className="self-start font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70 underline-offset-4 hover:text-danger hover:underline"
                >
                  Revoke link
                </button>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2.5 border-t-2 border-border-soft pt-4">
            <SectionLabel icon={<FolderOpen className="size-3.5" />}>
              AirDrop from this Mac
            </SectionLabel>
            <p className="text-xs leading-relaxed text-fg-muted">
              Writes the slides as numbered PNGs and opens the folder. Select
              them all, then Share &rsaquo; AirDrop to your phone.
            </p>
            <Button variant="outline" onClick={airdrop} disabled={busy}>
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FolderOpen className="size-4" />
              )}
              {share?.canReveal ? "Prepare for AirDrop" : "Export slides"}
            </Button>
            {reveal ? (
              <p className="break-all font-mono text-[10px] text-fg-muted">
                {reveal}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-2.5 border-t-2 border-border-soft pt-4">
            <SectionLabel icon={<RefreshCw className="size-3.5" />}>
              From this browser
            </SectionLabel>
            <WorkShareNativeButton
              slides={slides}
              title={bundleName}
              variant="outline"
            />
            <Button variant="outline" asChild>
              <a href={`/api/bundles/${bundleId}/download`} download>
                <Download className="size-4" />
                Download zip
              </a>
            </Button>
          </section>

          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
      {icon}
      {children}
    </p>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-xs text-fg-muted">
      <LoaderCircle className="size-3.5 animate-spin" />
      Reading network addresses…
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft px-3 py-2.5 text-xs leading-relaxed text-fg-muted">
      {children}
    </p>
  );
}
