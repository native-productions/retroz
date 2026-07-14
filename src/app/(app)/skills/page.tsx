import { Info } from "lucide-react";
import { db } from "@/lib/db-client";
import { PageHeader, PageBody } from "@/components/page-header";
import { SkillsManager } from "@/components/skill/skills-manager";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const skills = await db.skill.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <>
      <PageHeader
        title="Skills"
        description="Reusable recipes Claude can load while producing content."
        breadcrumb={[{ label: "Master" }, { label: "Skills" }]}
      />
      <PageBody className="flex flex-col gap-5">
        <div className="retro-card flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-secondary" />
          <p className="text-fg-muted">
            Skills here are written to{" "}
            <code className="font-mono">.claude/skills/</code> in this project.
            Claude also loads your global skills from{" "}
            <code className="font-mono">~/.claude/skills/</code> automatically on
            every run.
          </p>
        </div>
        <SkillsManager
          skills={skills.map((s) => ({
            id: s.id,
            slug: s.slug,
            name: s.name,
            description: s.description,
            content: s.content,
            enabled: s.enabled,
          }))}
        />
      </PageBody>
    </>
  );
}
