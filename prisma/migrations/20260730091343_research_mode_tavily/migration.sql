-- CreateEnum
CREATE TYPE "ResearchMode" AS ENUM ('OFF', 'AUTO', 'ON');

-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN     "tavilyApiKey" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "researchMode" "ResearchMode" NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "WorkMessage" ADD COLUMN     "researchMode" "ResearchMode";

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "researchMode" "ResearchMode" NOT NULL DEFAULT 'AUTO';
