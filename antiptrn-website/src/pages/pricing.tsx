import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import type { SubscriptionTier } from "@/hooks/use-auth";
import { useCreateSubscription } from "@/hooks/use-api";
import { Check, X, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  FREE: 0,
  CODE_REVIEW: 1,
  TRIAGE: 2,
};

interface Plan {
  name: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyPriceId: string;
  yearlyPriceId: string;
  description: string;
  features: { name: string; included: boolean; tooltip?: string }[];
  popular?: boolean;
}

const plans: Plan[] = [
  {
    name: "Free",
    tier: "FREE",
    monthlyPrice: 0,
    yearlyPrice: 0,
    monthlyPriceId: "",
    yearlyPriceId: "",
    description: "For individuals trying out the service",
    features: [
      { name: "1 repository", included: true },
      { name: "Basic code reviews", included: true },
      { name: "Community support", included: true },
      { name: "Triage mode", included: false, tooltip: "Enables back-and-forth conversations on review comments. The bot will respond to replies and engage in discussions about code changes." },
      { name: "Priority reviews", included: false },
      { name: "Custom review rules", included: false },
    ],
  },
  {
    name: "Code Review",
    tier: "CODE_REVIEW",
    monthlyPrice: 19,
    yearlyPrice: 190,
    monthlyPriceId: import.meta.env.VITE_POLAR_CODE_REVIEW_MONTHLY_PRODUCT_ID || "",
    yearlyPriceId: import.meta.env.VITE_POLAR_CODE_REVIEW_YEARLY_PRODUCT_ID || "",
    description: "For professional developers",
    features: [
      { name: "10 repositories", included: true },
      { name: "Advanced code reviews", included: true },
      { name: "Email support", included: true },
      { name: "Triage mode", included: false, tooltip: "Enables back-and-forth conversations on review comments. The bot will respond to replies and engage in discussions about code changes." },
      { name: "Priority reviews", included: true },
      { name: "Custom review rules", included: false },
    ],
    popular: true,
  },
  {
    name: "Triage",
    tier: "TRIAGE",
    monthlyPrice: 49,
    yearlyPrice: 490,
    monthlyPriceId: import.meta.env.VITE_POLAR_TRIAGE_MONTHLY_PRODUCT_ID || "",
    yearlyPriceId: import.meta.env.VITE_POLAR_TRIAGE_YEARLY_PRODUCT_ID || "",
    description: "For teams and organizations",
    features: [
      { name: "Unlimited repositories", included: true },
      { name: "Advanced code reviews", included: true },
      { name: "Priority support", included: true },
      { name: "Triage mode", included: true, tooltip: "Enables back-and-forth conversations on review comments. The bot will respond to replies and engage in discussions about code changes." },
      { name: "Priority reviews", included: true },
      { name: "Custom review rules", included: true },
    ],
  },
];

function PlanCard({
  plan,
  isYearly,
  currentTier,
  onSubscribe,
  isLoading,
}: {
  plan: Plan;
  isYearly: boolean;
  currentTier: SubscriptionTier;
  onSubscribe: (productId: string) => void;
  isLoading: boolean;
}) {
  const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
  const productId = isYearly ? plan.yearlyPriceId : plan.monthlyPriceId;

  const currentLevel = TIER_HIERARCHY[currentTier];
  const planLevel = TIER_HIERARCHY[plan.tier];

  const isCurrentPlan = currentTier === plan.tier;
  const isUpgrade = planLevel > currentLevel;
  const isDowngrade = planLevel < currentLevel;

  const getButtonText = () => {
    if (isCurrentPlan) return "Current Plan";
    if (plan.tier === "FREE") return "Downgrade to Free";
    if (isUpgrade) return "Upgrade";
    if (isDowngrade) return "Downgrade";
    return "Subscribe";
  };

  const getButtonVariant = () => {
    if (isCurrentPlan) return "secondary" as const;
    if (plan.popular) return "default" as const;
    return "secondary" as const;
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
          value={price}
          format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
          suffix={price > 0 ? (isYearly ? "/year" : "/month") : undefined}
          className="text-2xl [&>span:last-child]:text-base [&>span:last-child]:font-normal [&>span:last-child]:text-muted-foreground"
        />
        <AnimatePresence initial={false}>
          {isYearly && plan.monthlyPrice > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                Save <NumberFlow
                  value={plan.monthlyPrice * 12 - plan.yearlyPrice}
                  format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
                />/year
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ul className="mt-6 space-y-3 flex-1">
        {plan.features.map((feature) => (
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
        disabled={isCurrentPlan || isLoading || (plan.tier === "FREE" && currentTier === "FREE")}
        onClick={() => onSubscribe(productId)}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin mr-2" />
        ) : null}
        {getButtonText()}
      </Button>
    </div>
  );
}

export function PricingPage() {
  const { user, login } = useAuth();
  const queryClient = useQueryClient();
  const [isYearly, setIsYearly] = useState(false);

  const currentTier: SubscriptionTier = user?.subscriptionTier || "FREE";

  const createSubscription = useCreateSubscription(user?.access_token);

  const handleSubscribe = async (productId: string) => {
    if (!productId) {
      // Free plan - no action needed or handle downgrade
      return;
    }

    try {
      const data = await createSubscription.mutateAsync(productId);

      if (data.subscriptionUpdated) {
        // Subscription was updated in-place - invalidate all queries and reload
        await queryClient.invalidateQueries();
        window.location.reload();
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
          {createSubscription.error.message}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            isYearly={isYearly}
            currentTier={currentTier}
            onSubscribe={handleSubscribe}
            isLoading={createSubscription.isPending}
          />
        ))}
      </div>
    </section>
  );
}
