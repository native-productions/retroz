-- CreateEnum
CREATE TYPE "WorkflowAssetKind" AS ENUM ('BACKGROUND', 'LOGO', 'PATTERN', 'OTHER');

-- CreateTable
CREATE TABLE "WorkflowAsset" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "kind" "WorkflowAssetKind" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowAsset_workflowId_idx" ON "WorkflowAsset"("workflowId");

-- AddForeignKey
ALTER TABLE "WorkflowAsset" ADD CONSTRAINT "WorkflowAsset_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
