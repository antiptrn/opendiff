import type { SubscriptionTier } from "../auth";

/** Hierarchy of subscription tiers for comparison */
export const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  FREE: 0,
  SELF_SUFFICIENT: 1,
  PRO: 2,
  ULTRA: 3,
};

/** Tier labels for display */
export const tierLabels: Record<string, string> = {
  SELF_SUFFICIENT: "Self-sufficient",
  PRO: "Pro",
  ULTRA: "Ultra",
};

/** Tier prices per seat (monthly, in dollars) */
export const tierPrices: Record<string, number> = {
  SELF_SUFFICIENT: 9,
  PRO: 19,
  ULTRA: 49,
};

/** Configuration for a subscription plan */
export interface Plan {
  name: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  monthlyTokenQuota: number;
  features: { name: string; included: boolean; tooltip?: string }[];
  popular?: boolean;
}

/** Available subscription plans */
export const plans: Plan[] = [
  {
    name: "Self-sufficient",
    tier: "SELF_SUFFICIENT",
    monthlyPrice: 9,
    yearlyPrice: 90,
    description: "Bring your own Anthropic API key",
    monthlyTokenQuota: -1,
    features: [
      { name: "Unlimited repositories", included: true },
      { name: "Community support", included: true },
      {
        name: "Comment responses",
        included: true,
        tooltip: "AI responds to your questions and discussions on review comments.",
      },
      {
        name: "Auto-fix",
        included: true,
        tooltip: "Automatically fix validated issues, commit to PR branch, and resolve comments.",
      },
      {
        name: "Requires your API key",
        included: true,
        tooltip:
          "You'll need to provide your own Anthropic API key. You pay Anthropic directly for API usage.",
      },
      { name: "Custom review rules", included: true },
      {
        name: "Skills",
        included: true,
        tooltip:
          "Custom slash commands that extend the AI reviewer. Define instructions in markdown files and invoke them manually or let the AI apply them automatically when relevant.",
      },
    ],
  },
  {
    name: "Pro",
    tier: "PRO",
    monthlyPrice: 19,
    yearlyPrice: 190,
    popular: true,
    description: "For professional developers",
    monthlyTokenQuota: 2_500_000,
    features: [
      { name: "Unlimited repositories", included: true },
      { name: "Email support", included: true },
      {
        name: "Comment responses",
        included: true,
        tooltip: "AI responds to your questions and discussions on review comments.",
      },
      {
        name: "Auto-fix",
        included: true,
        tooltip: "Automatically fix validated issues, commit to PR branch, and resolve comments.",
      },
      { name: "Priority reviews", included: true },
      { name: "Custom review rules", included: true },
      {
        name: "Skills",
        included: true,
        tooltip:
          "Custom slash commands that extend the AI reviewer. Define instructions in markdown files and invoke them manually or let the AI apply them automatically when relevant.",
      },
    ],
  },
  {
    name: "Ultra",
    tier: "ULTRA",
    monthlyPrice: 49,
    yearlyPrice: 490,
    description: "Auto-fix issues directly in your PRs",
    monthlyTokenQuota: 8_000_000,
    features: [
      { name: "Unlimited repositories", included: true },
      { name: "Priority support", included: true },
      {
        name: "Comment responses",
        included: true,
        tooltip: "AI responds to your questions and discussions on review comments.",
      },
      {
        name: "Auto-fix",
        included: true,
        tooltip:
          "Validates issues, applies fixes, commits to your PR branch, and resolves comments automatically.",
      },
      { name: "Priority reviews", included: true },
      { name: "Custom review rules", included: true },
      {
        name: "Skills",
        included: true,
        tooltip:
          "Custom slash commands that extend the AI reviewer. Define instructions in markdown files and invoke them manually or let the AI apply them automatically when relevant.",
      },
    ],
  },
];
