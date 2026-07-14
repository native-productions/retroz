import Link from "next/link";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db-client";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/ui-button";
import { WorkflowSkillPicker } from "@/components/skill/workflow-skill-picker";

export async function WorkflowSkillsTab({
  workflowId,
}: {
  workflowId: string;
}) {
  const [skills, assigned] = await Promise.all([
    db.skill.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
    }),
    db.workflowSkill.findMany({ where: { workflowId }, select: { skillId: true } }),
  ]);

  if (skills.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="size-6" />}
        title="No skills yet"
        description="Create or sync skills first, then assign them to this workflow."
        action={
          <Button asChild variant="secondary">
            <Link href="/skills">Open Skills</Link>
          </Button>
        }
      />
    );
  }

  return (
    <WorkflowSkillPicker
      workflowId={workflowId}
      skills={skills.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        description: s.description,
      }))}
      assignedIds={assigned.map((a) => a.skillId)}
    />
  );
}
