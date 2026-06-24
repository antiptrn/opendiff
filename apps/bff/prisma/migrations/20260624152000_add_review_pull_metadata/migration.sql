-- Store stable PR metadata captured from webhook payloads so the app does not
-- depend on live GitHub metadata fetches for review list titles.
ALTER TABLE "Review"
ADD COLUMN "pullTitle" TEXT,
ADD COLUMN "pullAuthor" TEXT;
