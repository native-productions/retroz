-- CreateEnum
CREATE TYPE "AgentProvider" AS ENUM ('CLAUDE', 'CODEX');

-- AlterTable: engine selection + Codex defaults
ALTER TABLE "AppSetting"
  ADD COLUMN "provider" "AgentProvider" NOT NULL DEFAULT 'CLAUDE',
  ADD COLUMN "codexModel" TEXT NOT NULL DEFAULT 'gpt-5.4',
  ADD COLUMN "codexReasoningEffort" TEXT NOT NULL DEFAULT 'medium';

-- AlterTable: record which engine ran; generalize the session id column
-- (RENAME keeps existing Claude session ids).
ALTER TABLE "TaskRun"
  ADD COLUMN "provider" "AgentProvider" NOT NULL DEFAULT 'CLAUDE';
ALTER TABLE "TaskRun" RENAME COLUMN "claudeSessionId" TO "sessionId";
