-- DropForeignKey (none needed, just modifying columns)

-- AlterTable: RepositorySettings
-- Add githubRepoId column
ALTER TABLE "RepositorySettings" ADD COLUMN "githubRepoId" BIGINT;

-- Drop metadata columns from RepositorySettings
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "fullName";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "description";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "isPrivate";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "avatarUrl";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "defaultBranch";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "htmlUrl";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "language";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "pushedAt";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "readme";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "license";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "security";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "contributing";
ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "userId";

-- CreateIndex for githubRepoId
CREATE INDEX "RepositorySettings_githubRepoId_idx" ON "RepositorySettings"("githubRepoId");

-- AlterTable: Review
-- Add repositorySettingsId column
ALTER TABLE "Review" ADD COLUMN "repositorySettingsId" TEXT;

-- Drop metadata columns from Review
ALTER TABLE "Review" DROP COLUMN IF EXISTS "owner";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "repo";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "pullTitle";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "pullUrl";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "pullAuthor";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "pullBody";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "headBranch";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "baseBranch";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "assignees";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "labels";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "reviewers";

-- Drop old index on Review
DROP INDEX IF EXISTS "Review_owner_repo_idx";

-- CreateIndex for repositorySettingsId
CREATE INDEX "Review_repositorySettingsId_idx" ON "Review"("repositorySettingsId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_repositorySettingsId_fkey" FOREIGN KEY ("repositorySettingsId") REFERENCES "RepositorySettings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
