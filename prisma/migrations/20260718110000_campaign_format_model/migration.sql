-- CreateEnum
CREATE TYPE "CampaignFormat" AS ENUM ('SINGLE', 'CAROUSEL');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "format" "CampaignFormat" NOT NULL DEFAULT 'SINGLE',
ADD COLUMN     "model" TEXT,
ADD COLUMN     "provider" "AgentProvider";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "provider" "AgentProvider";
