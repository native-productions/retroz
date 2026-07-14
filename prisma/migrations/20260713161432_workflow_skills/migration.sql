-- CreateTable
CREATE TABLE "WorkflowSkill" (
    "workflowId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "WorkflowSkill_pkey" PRIMARY KEY ("workflowId","skillId")
);

-- CreateIndex
CREATE INDEX "WorkflowSkill_skillId_idx" ON "WorkflowSkill"("skillId");

-- AddForeignKey
ALTER TABLE "WorkflowSkill" ADD CONSTRAINT "WorkflowSkill_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSkill" ADD CONSTRAINT "WorkflowSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
