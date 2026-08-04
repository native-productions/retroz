import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { WorkShareNativeButton } from "@/components/work/work-share-native-button";
import { getSharedBundle } from "@/lib/bundle-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const bundle = await getSharedBundle(token);
  return { title: bundle ? `${bundle.name} — Retroz` : "Retroz" };
}

/**
 * The phone end of a share link: every slide of one bundle, in carousel order,
 * on a page with no login. Reached by scanning the QR code from the bundle
 * editor, over the LAN.
 *
 * Deliberately plain — the whole job is to get pixels into the camera roll, so
 * the slides are full-width and untouched, and the only two controls are the
 * OS share sheet and the zip.
 */
export default async function SharedBundlePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const bundle = await getSharedBundle(token);
  if (!bundle) notFound();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted/70">
          Retroz · shared bundle
        </p>
        <h1 className="font-display text-xl font-bold leading-tight">
          {bundle.name}
        </h1>
        <p className="font-mono text-[11px] text-fg-muted">
          {bundle.slides.length} slide{bundle.slides.length === 1 ? "" : "s"} ·
          carousel order
        </p>
      </header>

      {bundle.slides.length === 0 ? (
        <p className="rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft px-4 py-10 text-center text-sm text-fg-muted">
          This bundle has no slides yet.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            <WorkShareNativeButton
              slides={bundle.slides}
              title={bundle.name}
            />
            <Button variant="outline" asChild>
              <a href={bundle.downloadUrl} download>
                <Download className="size-4" />
                Download all as zip
              </a>
            </Button>
          </div>

          <p className="rounded-[var(--radius-retro)] border-2 border-border-soft bg-surface-2 px-3 py-2.5 text-center text-xs leading-relaxed text-fg-muted">
            On iPhone: press and hold a slide, then{" "}
            <span className="font-semibold text-fg">Add to Photos</span> — or use
            Share to send the whole carousel to Instagram at once.
          </p>

          <ol className="flex flex-col gap-4">
            {bundle.slides.map((slide, index) => (
              <li
                key={slide.id}
                className="overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 shadow-hard-sm"
              >
                <div className="relative">
                  {/* Plain <img>, like every other render surface here: the file
                      served must be the exact PNG, or a long-press saves a
                      re-encoded copy to the camera roll. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.url}
                    alt={`Slide ${index + 1}`}
                    width={slide.width ?? undefined}
                    height={slide.height ?? undefined}
                    className="h-auto w-full"
                  />
                  <span className="pointer-events-none absolute left-2 top-2 grid size-7 place-items-center rounded-[3px] border-2 border-border bg-primary font-mono text-xs font-bold tabular-nums text-primary-fg">
                    {index + 1}
                  </span>
                </div>
                <p className="truncate border-t-2 border-border bg-surface px-2.5 py-1.5 font-mono text-[10px] text-fg-muted">
                  {slide.filename}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
