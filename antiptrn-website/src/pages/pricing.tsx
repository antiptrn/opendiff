import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  TooltipContent,
  TooltipRoot,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { useCreateSubscription } from "@/hooks/use-api";
import type { SubscriptionTier } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, Loader2, X } from "lucide-react";
import { useState } from "react";

const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  FREE: 0,
  BYOK: 1,
  CODE_REVIEW: 2,
  TRIAGE: 3,
};

interface Plan {
  name: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyPriceId: string;
  yearlyPriceId: string;
  description: string;
  monthlyReviewQuota: number; // 0 means no reviews
  features: { name: string; included: boolean; tooltip?: string }[];
  popular?: boolean;
}

const plans: Plan[] = [
  {
    name: "BYOK",
    tier: "BYOK",
    monthlyPrice: 9,
    yearlyPrice: 90,
    monthlyPriceId: import.meta.env.VITE_POLAR_BYOK_MONTHLY_PRODUCT_ID || "",
    yearlyPriceId: import.meta.env.VITE_POLAR_BYOK_YEARLY_PRODUCT_ID || "",
    description: "Bring your own Anthropic API key",
    monthlyReviewQuota: -1, // Unlimited
    features: [
      { name: "Unlimited repositories", included: true },
      { name: "Community support", included: true },
      { name: "Triage mode", included: true, tooltip: "Enables back-and-forth conversations on review comments. The bot will respond to replies and engage in discussions about code changes." },
      { name: "Requires your API key", included: true, tooltip: "You'll need to provide your own Anthropic API key in settings. You pay Anthropic directly for API usage." },
      { name: "Custom review rules", included: true, tooltip: "Define custom rules and guidelines for the AI to follow when reviewing your code." },
    ],
  },
  {
    name: "Review",
    tier: "CODE_REVIEW",
    monthlyPrice: 19,
    yearlyPrice: 190,
    monthlyPriceId: import.meta.env.VITE_POLAR_CODE_REVIEW_MONTHLY_PRODUCT_ID || "",
    yearlyPriceId: import.meta.env.VITE_POLAR_CODE_REVIEW_YEARLY_PRODUCT_ID || "",
    description: "For professional developers",
    monthlyReviewQuota: 100,
    features: [
      { name: "10 repositories", included: true },
      { name: "Email support", included: true },
      { name: "Triage mode", included: false, tooltip: "Enables back-and-forth conversations on review comments. The bot will respond to replies and engage in discussions about code changes." },
      { name: "Priority reviews", included: true },
      { name: "Custom review rules", included: true, tooltip: "Define custom rules and guidelines for the AI to follow when reviewing your code." },
    ],
  },
  {
    name: "Triage",
    tier: "TRIAGE",
    monthlyPrice: 49,
    yearlyPrice: 490,
    monthlyPriceId: import.meta.env.VITE_POLAR_TRIAGE_MONTHLY_PRODUCT_ID || "",
    yearlyPriceId: import.meta.env.VITE_POLAR_TRIAGE_YEARLY_PRODUCT_ID || "",
    description: "For teams and organizations",
    monthlyReviewQuota: 250,
    features: [
      { name: "Unlimited repositories", included: true },
      { name: "Priority support", included: true },
      { name: "Triage mode", included: true, tooltip: "Enables back-and-forth conversations on review comments. The bot will respond to replies and engage in discussions about code changes." },
      { name: "Priority reviews", included: true },
      { name: "Custom review rules", included: true, tooltip: "Define custom rules and guidelines for the AI to follow when reviewing your code." },
    ],
  },
];

function PlanCard({
  plan,
  isYearly,
  currentTier,
  currentProductId,
  onSubscribe,
  isLoading,
}: {
  plan: Plan;
  isYearly: boolean;
  currentTier: SubscriptionTier;
  currentProductId: string | null | undefined;
  onSubscribe: (productId: string) => void;
  isLoading: boolean;
}) {
  const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
  const productId = isYearly ? plan.yearlyPriceId : plan.monthlyPriceId;

  const currentLevel = TIER_HIERARCHY[currentTier];
  const planLevel = TIER_HIERARCHY[plan.tier];

  // Compare exact product IDs when available (so monthly vs yearly are different)
  // Fall back to tier comparison if no productId (legacy or not synced)
  const isCurrentPlan = currentProductId
    ? productId === currentProductId
    : currentTier === plan.tier;

  // Only show "Switch Billing" when we have productId and it's same tier but different billing interval
  const isSameTierDifferentBilling = currentProductId && planLevel === currentLevel && !isCurrentPlan;

  const isUpgrade = planLevel > currentLevel;
  const isDowngrade = planLevel < currentLevel;

  const getButtonText = () => {
    if (isCurrentPlan) return "Current Plan";
    if (isSameTierDifferentBilling) return "Switch Billing Cycle";
    if (isUpgrade) return "Upgrade";
    if (isDowngrade) return "Downgrade";
    return "Subscribe";
  };

  const getButtonVariant = () => {
    if (isCurrentPlan) return "secondary" as const;
    if (isDowngrade) return "secondary";
    if (plan.popular) return "default" as const;

    // Check if the plan is a yearly plan and the current plan is a monthly plan
    if (isSameTierDifferentBilling && !isYearly) return "secondary";

    return "default" as const;
  };

  return (
    <div
      className="rounded-xl bg-card p-6 flex flex-col"
    >
      {plan.popular && (
        <div className="text-xs text-primary mb-2">Most Popular</div>
      )}
      <h3 className="text-lg">{plan.name}</h3>
      <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>

      <div className="mt-4">
        <NumberFlow
          value={isYearly ? Math.round((plan.yearlyPrice / 12) * 2) / 2 : price}
          format={{ style: "currency", currency: "USD", maximumFractionDigits: isYearly ? 2 : 0 }}
          suffix={price > 0 ? "/month" : undefined}
          className="text-2xl [&>span:last-child]:text-base [&>span:last-child]:font-normal [&>span:last-child]:text-muted-foreground"
        />
        <AnimatePresence initial={false}>
          {isYearly && plan.monthlyPrice > 0 && (
            <motion.p
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-sm text-green-600 dark:text-green-400 mt-1 overflow-hidden"
            >
              Save <NumberFlow
                value={plan.monthlyPrice * 12 - plan.yearlyPrice}
                format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
              />/year
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <ul className="mt-6 space-y-3 flex-1">
        {/* First feature (repositories) */}
        <li className="flex items-center gap-1.5 text-sm">
          <div className="mr-1">
            <Check className="size-4 text-green-600 dark:text-green-400 shrink-0" />
          </div>
          <span>{plan.features[0].name}</span>
        </li>

        {/* Review quota - dynamic based on billing cycle */}
        <li className="flex items-center gap-1.5 text-sm">
          <div className="mr-1">
            {plan.monthlyReviewQuota !== 0 ? (
              <Check className="size-4 text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <X className="size-4 text-muted-foreground shrink-0" />
            )}
          </div>
          <span className={plan.monthlyReviewQuota !== 0 ? "" : "text-muted-foreground"}>
            {plan.monthlyReviewQuota === -1 ? (
              "Unlimited reviews"
            ) : plan.monthlyReviewQuota > 0 ? (
              <>
                <NumberFlow
                  value={isYearly ? plan.monthlyReviewQuota * 12 : plan.monthlyReviewQuota}
                  className="tabular-nums"
                />
                {isYearly ? " reviews/year" : " reviews/month"}
              </>
            ) : (
              "No reviews included"
            )}
          </span>
          <TooltipRoot>
            <TooltipTrigger delay={0} className="text-muted-foreground hover:text-foreground transition-colors">
              <Info className="size-3" />
            </TooltipTrigger>
            <TooltipContent>
              {plan.monthlyReviewQuota === -1
                ? "No limits - you pay Anthropic directly for API usage"
                : plan.monthlyReviewQuota > 0
                  ? "Reviews reset at the start of each billing cycle"
                  : "Upgrade to a paid plan to enable code reviews"}
            </TooltipContent>
          </TooltipRoot>
        </li>

        {/* Remaining features */}
        {plan.features.slice(1).map((feature) => (
          <li key={feature.name} className="flex items-center gap-1.5 text-sm">
            <div className="mr-1">
              {feature.included ? (
                <Check className="size-4 text-green-600 dark:text-green-400 shrink-0" />
              ) : (
                <X className="size-4 text-muted-foreground shrink-0" />
              )}
            </div>
            <span className={feature.included ? "" : "text-muted-foreground"}>
              {feature.name}
            </span>
            {feature.tooltip && (
              <TooltipRoot>
                <TooltipTrigger delay={0} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="size-3" />
                </TooltipTrigger>
                <TooltipContent>{feature.tooltip}</TooltipContent>
              </TooltipRoot>
            )}
          </li>
        ))}
      </ul>

      <Button
        className="mt-6 w-full"
        size="lg"
        variant={getButtonVariant()}
        disabled={isCurrentPlan || isLoading}
        onClick={() => onSubscribe(productId)}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : null}
        {getButtonText()}
      </Button>
    </div>
  );
}

export function PricingPage() {
  const { user, login, refreshSubscription } = useAuth();
  const queryClient = useQueryClient();
  const [isYearly, setIsYearly] = useState(true);

  const currentTier: SubscriptionTier = user?.subscriptionTier || "FREE";

  const createSubscription = useCreateSubscription(user?.access_token);

  const handleSubscribe = async (productId: string) => {
    if (!productId) return;

    try {
      const data = await createSubscription.mutateAsync(productId);

      if (data.subscriptionUpdated) {
        // Subscription was updated in-place - refresh user data
        await refreshSubscription();
        await queryClient.invalidateQueries();
        return;
      }

      if (data.requiresAuth) {
        // User needs to log in first
        login();
        return;
      }

      if (data.checkoutUrl) {
        // Redirect to Polar checkout
        window.location.href = data.checkoutUrl;
      }
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <section className="pt-40 pb-32 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      <div className="flex flex-col text-center items-center justify-center">
        <h1 className="text-8xl mb-8">Built for developers</h1>
        <p className="text-muted-foreground text-lg">Whether you're a solo developer or part of a team, we've got you covered.</p>
      </div>
      <div className="flex items-center justify-center gap-3 mb-8 mt-12">
        <Label
          htmlFor="billing-toggle"
          className={cn("text-base", isYearly && "text-muted-foreground")}
        >
          Monthly
        </Label>
        <Switch
          id="billing-toggle"
          checked={isYearly}
          onCheckedChange={setIsYearly}
        />
        <Label
          htmlFor="billing-toggle"
          className={cn("text-base", !isYearly && "text-muted-foreground")}
        >
          Yearly
          <span className={cn("text-sm text-green-600 dark:text-green-400", !isYearly && "text-green-800 dark:text-green-600")}>
            Save 20%
          </span>
        </Label>
      </div>

      {createSubscription.error && (
        <div className="max-w-md mx-auto mb-8 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-center">
          {createSubscription.error?.message}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            isYearly={isYearly}
            currentTier={currentTier}
            currentProductId={user?.polarProductId}
            onSubscribe={handleSubscribe}
            isLoading={createSubscription.isPending}
          />
        ))}
      </div>
    </section>
  );
}
