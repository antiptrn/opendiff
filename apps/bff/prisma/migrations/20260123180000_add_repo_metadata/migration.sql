-- AlterTable
ALTER TABLE "RepositorySettings" ADD COLUMN "fullName" TEXT;
ALTER TABLE "RepositorySettings" ADD COLUMN "description" TEXT;
ALTER TABLE "RepositorySettings" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RepositorySettings" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "RepositorySettings" ADD COLUMN "defaultBranch" TEXT;
ALTER TABLE "RepositorySettings" ADD COLUMN "htmlUrl" TEXT;
