-- CreateEnum
CREATE TYPE "EngineMode" AS ENUM ('LOCAL', 'PROVIDER');

-- CreateEnum
CREATE TYPE "ModelSource" AS ENUM ('FETCHED', 'MANUAL');

-- AlterEnum
ALTER TYPE "AgentProvider" ADD VALUE 'OPENAI_COMPAT';

-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN     "defaultProviderModelId" TEXT,
ADD COLUMN     "engineMode" "EngineMode" NOT NULL DEFAULT 'LOCAL';

-- CreateTable
CREATE TABLE "ApiProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiProviderModel" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "supportsVision" BOOLEAN NOT NULL DEFAULT false,
    "contextWindow" INTEGER,
    "inputPricePerM" DECIMAL(12,4),
    "outputPricePerM" DECIMAL(12,4),
    "source" "ModelSource" NOT NULL DEFAULT 'FETCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiProviderModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTranscript" (
    "id" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiProvider_name_key" ON "ApiProvider"("name");

-- CreateIndex
CREATE INDEX "ApiProviderModel_providerId_idx" ON "ApiProviderModel"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiProviderModel_providerId_modelId_key" ON "ApiProviderModel"("providerId", "modelId");

-- AddForeignKey
ALTER TABLE "ApiProviderModel" ADD CONSTRAINT "ApiProviderModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ApiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
