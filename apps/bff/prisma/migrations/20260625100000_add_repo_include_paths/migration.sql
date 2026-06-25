-- Add optional include path scopes for review and autofix.
ALTER TABLE "RepositorySettings" ADD COLUMN "reviewIncludedDirs" TEXT;
ALTER TABLE "RepositorySettings" ADD COLUMN "autofixIncludedDirs" TEXT;
