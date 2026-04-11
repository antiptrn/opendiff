CREATE TYPE "AiAuthMethod" AS ENUM ('API_KEY', 'OAUTH_TOKEN');

ALTER TABLE "Organization"
ADD COLUMN "aiAuthMethod" "AiAuthMethod",
ADD COLUMN "aiApiKey" TEXT,
ADD COLUMN "aiOauthToken" TEXT,
ADD COLUMN "aiModel" TEXT;

UPDATE "Organization"
SET
  "aiAuthMethod" = 'API_KEY'::"AiAuthMethod",
  "aiApiKey" = "anthropicApiKey",
  "aiModel" = 'anthropic/claude-sonnet-4-5'
WHERE "anthropicApiKey" IS NOT NULL;
