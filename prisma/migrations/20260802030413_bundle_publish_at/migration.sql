-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';

-- AlterTable
ALTER TABLE "WorkBundle" ADD COLUMN     "publishAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WorkBundle_publishAt_idx" ON "WorkBundle"("publishAt");
