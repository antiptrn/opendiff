-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "tokensUsedThisCycle" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "tokensUsed" BIGINT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokensUsedThisCycle" BIGINT;
