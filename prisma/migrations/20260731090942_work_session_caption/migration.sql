-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "captionTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
