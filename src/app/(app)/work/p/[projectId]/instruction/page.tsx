import { notFound } from "next/navigation";
import { db } from "@/lib/db-client";
import { WorkProjectBar } from "@/components/work/work-project-bar";
import { WorkProjectBrief } from "@/components/work/work-project-brief";
import { listWorkProjects, listWorkflowOptions } from "@/lib/work-queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brief — Retroz" };

export default async function WorkBriefPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [projects, workflows] = await Promise.all([
    listWorkProjects(),
    listWorkflowOptions(),
  ]);
  if (!projects.some((p) => p.id === projectId)) notFound();

  const project = await db.workProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      instruction: true,
      workflow: { select: { name: true, globalInstruction: true } },
    },
  });
  if (!project) notFound();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkProjectBar
        projects={projects}
        activeProjectId={projectId}
        tab="instruction"
        workflows={workflows}
      />
      <WorkProjectBrief
        key={project.id}
        projectId={project.id}
        name={project.name}
        instruction={project.instruction}
        workflowName={project.workflow.name}
        channelInstruction={project.workflow.globalInstruction}
      />
    </div>
  );
}
