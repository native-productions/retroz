-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "autoDescribed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
