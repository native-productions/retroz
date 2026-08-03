-- CreateEnum
CREATE TYPE "ApiProtocol" AS ENUM ('OPENAI', 'GOOGLE');

-- AlterTable
ALTER TABLE "ApiProvider" ADD COLUMN     "protocol" "ApiProtocol" NOT NULL DEFAULT 'OPENAI';
