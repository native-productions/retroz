-- AlterTable
ALTER TABLE "RunArtifact" ADD COLUMN     "bytes" INTEGER;

-- CreateTable
CREATE TABLE "WorkBundle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkBundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "WorkBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkBundle_projectId_idx" ON "WorkBundle"("projectId");

-- CreateIndex
CREATE INDEX "WorkBundleItem_bundleId_order_idx" ON "WorkBundleItem"("bundleId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "WorkBundleItem_bundleId_artifactId_key" ON "WorkBundleItem"("bundleId", "artifactId");

-- AddForeignKey
ALTER TABLE "WorkBundle" ADD CONSTRAINT "WorkBundle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkBundleItem" ADD CONSTRAINT "WorkBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "WorkBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkBundleItem" ADD CONSTRAINT "WorkBundleItem_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "RunArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
