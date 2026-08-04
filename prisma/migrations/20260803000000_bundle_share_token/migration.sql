-- AlterTable
ALTER TABLE "WorkBundle" ADD COLUMN     "shareToken" TEXT,
ADD COLUMN     "sharedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "WorkBundle_shareToken_key" ON "WorkBundle"("shareToken");
