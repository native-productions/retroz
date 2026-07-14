-- AlterTable
ALTER TABLE "TaskRun" ADD COLUMN     "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "durationApiMs" INTEGER,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "modelUsage" JSONB,
ADD COLUMN     "numTurns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduleId" TEXT;

-- CreateIndex
CREATE INDEX "TaskRun_scheduleId_idx" ON "TaskRun"("scheduleId");

-- AddForeignKey
ALTER TABLE "TaskRun" ADD CONSTRAINT "TaskRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
