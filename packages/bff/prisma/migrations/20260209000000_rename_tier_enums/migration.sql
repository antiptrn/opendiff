-- Rename SubscriptionTier enum values
ALTER TYPE "SubscriptionTier" RENAME VALUE 'BYOK' TO 'SELF_SUFFICIENT';
ALTER TYPE "SubscriptionTier" RENAME VALUE 'CODE_REVIEW' TO 'PRO';
ALTER TYPE "SubscriptionTier" RENAME VALUE 'TRIAGE' TO 'ULTRA';
