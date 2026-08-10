-- Require repositories to explicitly opt in before OpenDiff submits approving reviews.
ALTER TABLE "RepositorySettings"
ADD COLUMN "approveEnabled" BOOLEAN NOT NULL DEFAULT false;
