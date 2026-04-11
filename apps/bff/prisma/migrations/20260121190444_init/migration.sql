-- AlterTable
ALTER TABLE "RepositorySettings" ADD COLUMN     "userId" TEXT;

-- AddForeignKey
ALTER TABLE "RepositorySettings" ADD CONSTRAINT "RepositorySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
