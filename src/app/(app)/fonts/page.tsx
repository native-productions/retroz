import { Type, Layers } from "lucide-react";
import { db } from "@/lib/db-client";
import { PageHeader, PageBody, EmptyState } from "@/components/page-header";
import { FontFaceStyles } from "@/components/font/font-face-styles";
import { FontAddDialog } from "@/components/font/font-add-dialog";
import { FontCard } from "@/components/font/font-card";
import { PairingCreateDialog } from "@/components/font/pairing-create-dialog";
import { PairingRow } from "@/components/font/pairing-row";

export const dynamic = "force-dynamic";

export default async function FontsPage() {
  const [fonts, pairings] = await Promise.all([
    db.font.findMany({
      orderBy: { createdAt: "desc" },
      include: { variants: true },
    }),
    db.fontPairing.findMany({
      orderBy: { createdAt: "desc" },
      include: { headingFont: true, bodyFont: true },
    }),
  ]);

  const previewFonts = fonts.map((f) => ({
    family: f.family,
    variants: f.variants.map((v) => ({
      weight: v.weight,
      weightRange: v.weightRange,
      style: v.style,
      relPath: v.relPath,
    })),
  }));

  return (
    <>
      <FontFaceStyles fonts={previewFonts} />
      <PageHeader
        title="Font Bank"
        description="Global fonts your content can use. Assign per workflow; the AI picks by mood."
        breadcrumb={[{ label: "Master" }, { label: "Fonts" }]}
      >
        <FontAddDialog existingFamilies={fonts.map((f) => f.family)} />
      </PageHeader>

      <PageBody className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          {fonts.length === 0 ? (
            <EmptyState
              icon={<Type className="size-6" />}
              title="No fonts yet"
              description="Add from Google Fonts (auto-downloaded), a direct URL, or upload your own files."
              action={<FontAddDialog />}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fonts.map((f) => (
                <FontCard
                  key={f.id}
                  font={{
                    id: f.id,
                    family: f.family,
                    category: f.category,
                    moodTags: f.moodTags,
                    previewText: f.previewText,
                    enabled: f.enabled,
                    source: f.source,
                    variantCount: f.variants.length,
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold">
              <Layers className="size-4 text-secondary" /> Pairings
            </h2>
            <PairingCreateDialog
              fonts={fonts.map((f) => ({ id: f.id, family: f.family }))}
            />
          </div>
          {pairings.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No pairings yet. Pair a heading + body font for coherent combos.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {pairings.map((p) => (
                <PairingRow
                  key={p.id}
                  pairing={{
                    id: p.id,
                    name: p.name,
                    heading: p.headingFont.family,
                    body: p.bodyFont.family,
                    moodTags: p.moodTags,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}
