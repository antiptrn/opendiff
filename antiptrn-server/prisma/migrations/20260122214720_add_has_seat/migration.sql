/*
  Warnings:

  - You are about to drop the column `polarCustomerId` on the `Organization` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "polarCustomerId",
ALTER COLUMN "subscriptionTier" DROP NOT NULL,
ALTER COLUMN "subscriptionTier" DROP DEFAULT,
ALTER COLUMN "subscriptionStatus" DROP NOT NULL,
ALTER COLUMN "subscriptionStatus" DROP DEFAULT,
ALTER COLUMN "seatCount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN     "hasSeat" BOOLEAN NOT NULL DEFAULT false;
