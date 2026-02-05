-- AlterEnum
ALTER TYPE "SubscriptionTier" ADD VALUE 'BYOK';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "anthropicApiKey" TEXT,
ADD COLUMN     "customReviewRules" TEXT,
ADD COLUMN     "polarProductId" TEXT,
ADD COLUMN     "reviewsUsedThisCycle" INTEGER NOT NULL DEFAULT 0;
