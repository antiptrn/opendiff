-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('SOLO', 'TEAM');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountType" "AccountType",
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);
