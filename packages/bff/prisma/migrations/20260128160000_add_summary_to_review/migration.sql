-- AlterTable
ALTER TABLE "Review" ADD COLUMN "summary" TEXT;
ALTER TABLE "Review" ADD COLUMN "summaryStatus" INTEGER NOT NULL DEFAULT 0;
