-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "reviewers" JSONB NOT NULL DEFAULT '[]';
