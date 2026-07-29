-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "WorkProject" ADD COLUMN     "assetFolderId" TEXT;

-- CreateIndex
CREATE INDEX "Asset_folderId_sourceRef_idx" ON "Asset"("folderId", "sourceRef");

-- AddForeignKey
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_assetFolderId_fkey" FOREIGN KEY ("assetFolderId") REFERENCES "AssetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
