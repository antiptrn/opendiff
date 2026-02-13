-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FixStatus" ADD VALUE 'WAITING_FOR_USER';
ALTER TYPE "FixStatus" ADD VALUE 'APPLYING';
ALTER TYPE "FixStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "ReviewFix" ADD COLUMN     "clarificationContext" JSONB,
ADD COLUMN     "clarificationQuestion" TEXT,
ADD COLUMN     "fingerprint" TEXT;

-- CreateTable
CREATE TABLE "ReviewClarificationLock" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "pullNumber" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "issueType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reviewFixId" TEXT,
    "threadGithubCommentId" BIGINT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewClarificationLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecutionLock" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentExecutionLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewClarificationLock_owner_repo_pullNumber_active_idx" ON "ReviewClarificationLock"("owner", "repo", "pullNumber", "active");

-- CreateIndex
CREATE INDEX "ReviewClarificationLock_threadGithubCommentId_idx" ON "ReviewClarificationLock"("threadGithubCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewClarificationLock_owner_repo_pullNumber_fingerprint_key" ON "ReviewClarificationLock"("owner", "repo", "pullNumber", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecutionLock_key_key" ON "AgentExecutionLock"("key");

-- CreateIndex
CREATE INDEX "ReviewFix_status_idx" ON "ReviewFix"("status");

-- CreateIndex
CREATE INDEX "ReviewFix_fingerprint_idx" ON "ReviewFix"("fingerprint");
