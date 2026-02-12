-- CreateEnum
CREATE TYPE "FixStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autofixEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "isRegisteredBusiness" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxVatId" TEXT;

-- AlterTable
ALTER TABLE "RepositorySettings" ADD COLUMN     "contributing" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "license" TEXT,
ADD COLUMN     "pushedAt" TIMESTAMP(3),
ADD COLUMN     "readme" TEXT,
ADD COLUMN     "security" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "pullAuthor" TEXT,
ADD COLUMN     "pullTitle" TEXT,
ADD COLUMN     "pullUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubRefreshToken" TEXT,
ADD COLUMN     "googleRefreshToken" TEXT,
ADD COLUMN     "microsoftId" TEXT,
ADD COLUMN     "microsoftRefreshToken" TEXT;

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "githubCommentId" BIGINT,
    "body" TEXT NOT NULL,
    "path" TEXT,
    "line" INTEGER,
    "side" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewFix" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "status" "FixStatus" NOT NULL DEFAULT 'PENDING',
    "diff" TEXT,
    "commitSha" TEXT,
    "summary" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewFix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "page" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewComment_reviewId_idx" ON "ReviewComment"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewFix_commentId_key" ON "ReviewFix"("commentId");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Review_organizationId_idx" ON "Review"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_microsoftId_key" ON "User"("microsoftId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFix" ADD CONSTRAINT "ReviewFix_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ReviewComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
