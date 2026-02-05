-- DropIndex (make githubId optional)
DROP INDEX IF EXISTS "User_githubId_key";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "githubId" DROP NOT NULL;

-- Add googleId column
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

-- CreateIndex for googleId (unique, optional)
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex for githubId (unique, optional - recreate after making nullable)
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex for email (unique, optional)
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
