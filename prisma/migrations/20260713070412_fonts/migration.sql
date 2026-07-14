-- CreateEnum
CREATE TYPE "FontSource" AS ENUM ('GOOGLE', 'URL', 'UPLOAD');

-- CreateEnum
CREATE TYPE "FontCategory" AS ENUM ('SANS', 'SERIF', 'DISPLAY', 'HANDWRITING', 'MONOSPACE', 'OTHER');

-- CreateTable
CREATE TABLE "Font" (
    "id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "source" "FontSource" NOT NULL,
    "category" "FontCategory" NOT NULL DEFAULT 'SANS',
    "moodTags" TEXT NOT NULL DEFAULT '',
    "previewText" TEXT NOT NULL DEFAULT 'The quick brown fox',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Font_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FontVariant" (
    "id" TEXT NOT NULL,
    "fontId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 400,
    "weightRange" TEXT,
    "style" TEXT NOT NULL DEFAULT 'normal',
    "format" TEXT NOT NULL DEFAULT 'woff2',
    "filename" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,

    CONSTRAINT "FontVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowFont" (
    "workflowId" TEXT NOT NULL,
    "fontId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'any',

    CONSTRAINT "WorkflowFont_pkey" PRIMARY KEY ("workflowId","fontId")
);

-- CreateTable
CREATE TABLE "FontPairing" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headingFontId" TEXT NOT NULL,
    "bodyFontId" TEXT NOT NULL,
    "moodTags" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FontPairing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Font_slug_key" ON "Font"("slug");

-- CreateIndex
CREATE INDEX "FontVariant_fontId_idx" ON "FontVariant"("fontId");

-- CreateIndex
CREATE INDEX "WorkflowFont_fontId_idx" ON "WorkflowFont"("fontId");

-- AddForeignKey
ALTER TABLE "FontVariant" ADD CONSTRAINT "FontVariant_fontId_fkey" FOREIGN KEY ("fontId") REFERENCES "Font"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowFont" ADD CONSTRAINT "WorkflowFont_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowFont" ADD CONSTRAINT "WorkflowFont_fontId_fkey" FOREIGN KEY ("fontId") REFERENCES "Font"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FontPairing" ADD CONSTRAINT "FontPairing_headingFontId_fkey" FOREIGN KEY ("headingFontId") REFERENCES "Font"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FontPairing" ADD CONSTRAINT "FontPairing_bodyFontId_fkey" FOREIGN KEY ("bodyFontId") REFERENCES "Font"("id") ON DELETE CASCADE ON UPDATE CASCADE;
