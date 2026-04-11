-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "assignees" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "labels" JSONB NOT NULL DEFAULT '[]';
