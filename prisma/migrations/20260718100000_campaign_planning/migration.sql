-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PLANNING', 'REVIEW', 'AWAITING_ASSETS', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignItemStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED', 'SKIPPED');

-- AlterTable
ALTER TABLE "RunEvent" ADD COLUMN     "campaignPlanRunId" TEXT,
ALTER COLUMN "taskRunId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brief" TEXT NOT NULL DEFAULT '',
    "briefRelPath" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "startDate" TIMESTAMP(3),
    "durationDays" INTEGER,
    "slotsPerDay" INTEGER,
    "slotTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assetFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "angle" TEXT,
    "instruction" TEXT NOT NULL DEFAULT '',
    "caption" TEXT,
    "status" "CampaignItemStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "taskId" TEXT,
    "taskRunId" TEXT,
    "assetPlan" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAssetRequest" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 1,
    "fulfilled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CampaignAssetRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignItemAsset" (
    "campaignItemId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "CampaignItemAsset_pkey" PRIMARY KEY ("campaignItemId","assetId")
);

-- CreateTable
CREATE TABLE "CampaignPlanRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "scope" TEXT NOT NULL DEFAULT 'full',
    "itemId" TEXT,
    "provider" "AgentProvider" NOT NULL DEFAULT 'CLAUDE',
    "model" TEXT,
    "sessionId" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "numTurns" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "durationApiMs" INTEGER,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "modelUsage" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignPlanRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_workflowId_idx" ON "Campaign"("workflowId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignItem_taskId_key" ON "CampaignItem"("taskId");

-- CreateIndex
CREATE INDEX "CampaignItem_campaignId_idx" ON "CampaignItem"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignItem_status_idx" ON "CampaignItem"("status");

-- CreateIndex
CREATE INDEX "CampaignItem_scheduledAt_idx" ON "CampaignItem"("scheduledAt");

-- CreateIndex
CREATE INDEX "CampaignAssetRequest_campaignId_idx" ON "CampaignAssetRequest"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignItemAsset_assetId_idx" ON "CampaignItemAsset"("assetId");

-- CreateIndex
CREATE INDEX "CampaignPlanRun_campaignId_idx" ON "CampaignPlanRun"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignPlanRun_status_idx" ON "CampaignPlanRun"("status");

-- CreateIndex
CREATE INDEX "RunEvent_campaignPlanRunId_seq_idx" ON "RunEvent"("campaignPlanRunId", "seq");

-- AddForeignKey
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_campaignPlanRunId_fkey" FOREIGN KEY ("campaignPlanRunId") REFERENCES "CampaignPlanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_assetFolderId_fkey" FOREIGN KEY ("assetFolderId") REFERENCES "AssetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItem" ADD CONSTRAINT "CampaignItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItem" ADD CONSTRAINT "CampaignItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAssetRequest" ADD CONSTRAINT "CampaignAssetRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItemAsset" ADD CONSTRAINT "CampaignItemAsset_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "CampaignItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItemAsset" ADD CONSTRAINT "CampaignItemAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlanRun" ADD CONSTRAINT "CampaignPlanRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
