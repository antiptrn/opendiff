import type { SubscriptionTier } from "@/hooks/use-auth";

/** Hierarchy of subscription tiers for comparison */
export const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  FREE: 0,
  BYOK: 1,
  CODE_REVIEW: 2,
  TRIAGE: 3,
};

/** Configuration for a subscription plan */
export interface Plan {
  name: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  monthlyReviewQuota: number;
  features: { name: string; included: boolean; tooltip?: string }[];
  popular?: boolean;
}

/** Available subscription plans */
export const plans: Plan[] = [
  {
    name: "BYOK",
    tier: "BYOK",
    monthlyPrice: 9,
    yearlyPrice: 90,
    description: "Bring your own Anthropic API key",
    monthlyReviewQuota: -1,
    features: [
      { name: "Unlimited repositories", included: true },
      { name: "Community support", included: true },
      {
        name: "Triage mode",
        included: true,
        tooltip: "Enables back-and-forth conversations on review comments.",
      },
      {
        name: "Requires your API key",
        included: true,
        tooltip:
          "You'll need to provide your own Anthropic API key. You pay Anthropic directly for API usage.",
      },
      { name: "Custom review rules", included: true },
    ],
  },
  {
    name: "Review",
    tier: "CODE_REVIEW",
    monthlyPrice: 19,
    yearlyPrice: 190,
    description: "For professional developers",
    monthlyReviewQuota: 100,
    features: [
      { name: "10 repositories", included: true },
      { name: "Email support", included: true },
      {
        name: "Triage mode",
        included: false,
        tooltip: "Enables back-and-forth conversations on review comments.",
      },
      { name: "Priority reviews", included: true },
      { name: "Custom review rules", included: true },
    ],
  },
  {
    name: "Triage",
    tier: "TRIAGE",
    monthlyPrice: 49,
    yearlyPrice: 490,
    description: "For power users",
    monthlyReviewQuota: 250,
    popular: true,
    features: [
      { name: "Unlimited repositories", included: true },
      { name: "Priority support", included: true },
      {
        name: "Triage mode",
        included: true,
        tooltip: "Enables back-and-forth conversations on review comments.",
      },
      { name: "Priority reviews", included: true },
      { name: "Custom review rules", included: true },
    ],
  },
];
