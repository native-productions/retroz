import { notFound } from "next/navigation";
import { db } from "@/lib/db-client";
import { PageHeader, PageBody } from "@/components/page-header";
import { Badge } from "@/components/ui/ui-badge";
import { WorkflowTabs } from "@/components/workflow/workflow-tabs";
import { WorkflowInstructionEditor } from "@/components/workflow/workflow-instruction-editor";
import { AssetsTab } from "@/components/asset/assets-tab";
import { WorkflowFontsTab } from "@/components/font/workflow-fonts-tab";
import { WorkflowSkillsTab } from "@/components/skill/workflow-skills-tab";
import { TasksTab } from "@/components/task/tasks-tab";
import { ScheduleTab } from "@/components/schedule/schedule-tab";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workflow = await db.workflow.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          assetFolders: true,
          tasks: true,
          schedules: true,
          workflowFonts: true,
          workflowSkills: true,
        },
      },
    },
  });
  if (!workflow) notFound();

  return (
    <>
      <PageHeader
        title={workflow.name}
        description={workflow.description ?? undefined}
        breadcrumb={[
          { label: "Workflows", href: "/workflows" },
          { label: workflow.name },
        ]}
      >
        <Badge tone="secondary">{workflow.platform}</Badge>
      </PageHeader>

      <PageBody className="flex flex-col gap-5">
        <WorkflowTabs
          counts={{
            assets: workflow._count.assetFolders,
            tasks: workflow._count.tasks,
            schedules: workflow._count.schedules,
            fonts: workflow._count.workflowFonts,
            skills: workflow._count.workflowSkills,
          }}
          instruction={
            <WorkflowInstructionEditor
              workflowId={workflow.id}
              workflowName={workflow.name}
              initialInstruction={workflow.globalInstruction}
              initialModel={workflow.defaultModel}
            />
          }
          assets={<AssetsTab workflowId={workflow.id} />}
          fonts={<WorkflowFontsTab workflowId={workflow.id} />}
          skills={<WorkflowSkillsTab workflowId={workflow.id} />}
          tasks={<TasksTab workflowId={workflow.id} />}
          schedule={<ScheduleTab workflowId={workflow.id} />}
        />
      </PageBody>
    </>
  );
}
