-- CreateTable
CREATE TABLE "RenderSource" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RenderSource_artifactId_key" ON "RenderSource"("artifactId");

-- AddForeignKey
ALTER TABLE "RenderSource" ADD CONSTRAINT "RenderSource_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "RunArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
