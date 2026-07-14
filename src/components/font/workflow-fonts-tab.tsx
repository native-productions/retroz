import Link from "next/link";
import { Type } from "lucide-react";
import { db } from "@/lib/db-client";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/ui-button";
import { FontFaceStyles } from "@/components/font/font-face-styles";
import { WorkflowFontPicker } from "@/components/font/workflow-font-picker";

export async function WorkflowFontsTab({ workflowId }: { workflowId: string }) {
  const [fonts, assigned] = await Promise.all([
    db.font.findMany({
      where: { enabled: true },
      orderBy: { family: "asc" },
      include: { variants: true },
    }),
    db.workflowFont.findMany({ where: { workflowId }, select: { fontId: true } }),
  ]);

  if (fonts.length === 0) {
    return (
      <EmptyState
        icon={<Type className="size-6" />}
        title="Font Bank is empty"
        description="Add fonts to the bank first, then assign them here."
        action={
          <Button asChild variant="secondary">
            <Link href="/fonts">Open Font Bank</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <FontFaceStyles
        fonts={fonts.map((f) => ({
          family: f.family,
          variants: f.variants.map((v) => ({
            weight: v.weight,
            weightRange: v.weightRange,
            style: v.style,
            relPath: v.relPath,
          })),
        }))}
      />
      <WorkflowFontPicker
        workflowId={workflowId}
        fonts={fonts.map((f) => ({
          id: f.id,
          family: f.family,
          category: f.category,
        }))}
        assignedIds={assigned.map((a) => a.fontId)}
      />
    </>
  );
}
