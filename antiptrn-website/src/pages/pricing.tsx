import { Button } from "@/components/ui/button";
import {
  TooltipContent,
  TooltipRoot,
  TooltipTrigger
} from "@/components/ui/tooltip";
import type { SubscriptionTier } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization, useManageSubscription } from "@/hooks/use-organization";
import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  description: string;
  monthlyReviewQuota: number;
  features: { name: string; included: boolean; tooltip?: string }[];
  popular?: boolean;
}

const plans: Plan[] = [
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
      { name: "Triage mode", included: true, tooltip: "Enables back-and-forth conversations on review comments." },
      { name: "Requires your API key", included: true, tooltip: "You'll need to provide your own Anthropic API key. You pay Anthropic directly for API usage." },
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
      { name: "Triage mode", included: false, tooltip: "Enables back-and-forth conversations on review comments." },
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
      { name: "Triage mode", included: true, tooltip: "Enables back-and-forth conversations on review comments." },
      { name: "Priority reviews", included: true },
      { name: "Custom review rules", included: true },
    ],
  },
];

function PlanCard({
  plan,
  isYearly,
  onGetStarted,
  isLoading,
  // Solo user subscription info (only provided for solo users)
  isSoloUser,
  currentTier,
  currentBillingYearly,
}: {
  plan: Plan;
  isYearly: boolean;
  onGetStarted: (tier: SubscriptionTier) => void;
  isLoading: boolean;
  isSoloUser?: boolean;
  currentTier?: SubscriptionTier | null;
  currentBillingYearly?: boolean;
}) {
  const price = isYearly ? plan.yearlyPrice / 12 : plan.monthlyPrice;

  // For solo users, determine button text based on current subscription
  const getButtonText = () => {
    if (!isSoloUser || !currentTier) return "Get started";

    const currentLevel = TIER_HIERARCHY[currentTier];
    const planLevel = TIER_HIERARCHY[plan.tier];

    // Check if same tier but different billing cycle
    if (currentTier === plan.tier) {
      if (currentBillingYearly === isYearly) return "Current Plan";
      return "Switch Billing Cycle";
    }

    if (planLevel > currentLevel) return "Upgrade";
    if (planLevel < currentLevel) return "Downgrade";
    return "Get started";
  };

  const getButtonVariant = () => {
    if (!isSoloUser || !currentTier) {
      return plan.popular ? "default" : "secondary";
    }

    const currentLevel = TIER_HIERARCHY[currentTier];
    const planLevel = TIER_HIERARCHY[plan.tier];
    const isCurrentPlan = currentTier === plan.tier && currentBillingYearly === isYearly;

    if (isCurrentPlan) return "secondary";
    if (planLevel < currentLevel) return "secondary"; // Downgrade
    if (currentTier === plan.tier && !isYearly) return "secondary"; // Switch to monthly
    if (plan.popular) return "default";
    return "default";
  };

  const isCurrentPlan = isSoloUser && currentTier === plan.tier && currentBillingYearly === isYearly;

  return (
    <div className="rounded-xl bg-card p-6 flex flex-col">
      {plan.popular && (
        <div className="text-xs text-primary mb-2">Most Popular</div>
      )}
      <h3 className="text-lg">{plan.name}</h3>
      <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>

      <div className="mt-4">
        <NumberFlow
          value={isYearly ? Math.round(price * 2) / 2 : price}
          format={{ style: "currency", currency: "USD", maximumFractionDigits: isYearly ? 2 : 0 }}
          suffix="/month"
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
        <li className="flex items-center gap-1.5 text-sm">
          <div className="mr-1">
            <Check className="size-4 text-green-600 dark:text-green-400 shrink-0" />
          </div>
          <span>{plan.features[0].name}</span>
        </li>

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
              <>{plan.monthlyReviewQuota} reviews/month</>
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
                  ? "Reviews reset monthly"
                  : "Purchase a seat to enable code reviews"}
            </TooltipContent>
          </TooltipRoot>
        </li>

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
        className="mt-6 w-full rounded-full"
        size="lg"
        variant={getButtonVariant()}
        disabled={isLoading || isCurrentPlan}
        onClick={() => onGetStarted(plan.tier)}
      >
        {isLoading && <Loader2 className="size-4 animate-spin" />}
        {getButtonText()}
      </Button>
    </div>
  );
}

function TeamCard({
  isYearly,
  onGetStarted,
  isLoading,
}: {
  isYearly: boolean;
  onGetStarted: (seatCount: number) => void;
  isLoading: boolean;
}) {
  const [seatCount, setSeatCount] = useState(5);
  const monthlyPricePerSeat = 49;
  const yearlyPricePerSeat = 490;
  const pricePerSeat = isYearly ? yearlyPricePerSeat / 12 : monthlyPricePerSeat;
  const totalPrice = pricePerSeat * seatCount;
  const monthlyReviewQuota = 250;
  const yearlySavings = (monthlyPricePerSeat * 12 - yearlyPricePerSeat) * seatCount;

  return (
    <div className="rounded-xl bg-card p-8 mt-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex-1">
          <h3 className="text-xl font-semibold">Team</h3>
          <p className="text-muted-foreground mt-1">
            For teams that need multiple seats. All the features of Triage, with volume pricing.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <li className="flex items-center gap-1.5 text-sm">
              <Check className="size-4 text-green-600 dark:text-green-400" />
              <span>Unlimited repositories</span>
            </li>
            <li className="flex items-center gap-1.5 text-sm">
              <Check className="size-4 text-green-600 dark:text-green-400" />
              <span>Priority support</span>
            </li>
            <li className="flex items-center gap-1.5 text-sm">
              <Check className="size-4 text-green-600 dark:text-green-400" />
              <span>Triage mode</span>
            </li>
            <li className="flex items-center gap-1.5 text-sm">
              <Check className="size-4 text-green-600 dark:text-green-400" />
              <span>Shared review pool</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col items-center gap-4 md:items-end">
          {/* Seat selector */}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={2}
              max={100}
              value={seatCount}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 2;
                setSeatCount(Math.max(2, Math.min(100, val)));
              }}
              className="w-20 text-center text-lg font-semibold"
            />
            <span className="text-sm text-muted-foreground">seats</span>
          </div>

          {/* Pricing */}
          <div className="text-center md:text-right">
            <NumberFlow
              value={isYearly ? Math.round(totalPrice * 2) / 2 : totalPrice}
              format={{ style: "currency", currency: "USD", maximumFractionDigits: isYearly ? 2 : 0 }}
              suffix="/month"
              className="text-2xl font-semibold"
            />
            <p className="text-sm text-muted-foreground">
              ${isYearly ? (yearlyPricePerSeat / 12).toFixed(2) : monthlyPricePerSeat}/seat × {seatCount} seats
            </p>
            <p className="text-sm text-muted-foreground">
              {monthlyReviewQuota * seatCount} reviews/month pooled
            </p>
            <AnimatePresence initial={false}>
              {isYearly && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-sm text-green-600 dark:text-green-400 mt-1 overflow-hidden"
                >
                  Save <NumberFlow
                    value={yearlySavings}
                    format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
                  />/year
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <Button
            size="lg"
            disabled={isLoading}
            onClick={() => onGetStarted(seatCount)}
          >
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            Get started with {seatCount} seats
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PricingPage() {
  const { user, login } = useAuth();
  const { currentOrgId, subscription, orgDetails } = useOrganization();
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const isSoloUser = user?.accountType === "SOLO";
  // Get org ID - prefer context, fallback to user's first org
  const orgId = currentOrgId || user?.organizations?.[0]?.id || null;
  const manageSubscription = useManageSubscription(orgId);

  // Get current subscription info for solo users
  const currentTier = isSoloUser ? (subscription?.tier || null) : null;
  // Determine if current subscription is yearly based on expiration date
  const currentBillingYearly = isSoloUser && orgDetails?.subscription?.expiresAt
    ? (() => {
      // Check if expiration is roughly a year away (more than 60 days)
      const expiresAt = new Date(orgDetails.subscription.expiresAt);
      const now = new Date();
      const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return daysUntilExpiry > 60;
    })()
    : undefined;

  const handleGetStarted = async (tier: SubscriptionTier) => {
    if (!user) {
      // Store selected tier for after login
      sessionStorage.setItem("pricing_tier", tier);
      sessionStorage.setItem("pricing_billing", isYearly ? "yearly" : "monthly");
      login();
      return;
    }

    // Solo users go directly to checkout
    if (isSoloUser && orgId) {
      setIsLoading(true);
      try {
        const result = await manageSubscription.mutateAsync({
          tier: tier as "BYOK" | "CODE_REVIEW" | "TRIAGE",
          billing: isYearly ? "yearly" : "monthly",
          seatCount: 1,
        });
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
        }
      } catch (error) {
        console.error("Failed to create checkout:", error);
        setIsLoading(false);
      }
      return;
    }

    // Team users go to organization settings
    navigate("/console/settings?tab=organization");
  };

  const handleEnterpriseGetStarted = async (seatCount: number) => {
    if (!user) {
      sessionStorage.setItem("pricing_seat_count", String(seatCount));
      sessionStorage.setItem("pricing_tier", "TRIAGE");
      sessionStorage.setItem("pricing_billing", isYearly ? "yearly" : "monthly");
      login();
      return;
    }

    // Team card is always for teams, go to organization settings
    navigate("/console/settings?tab=organization", { state: { seatCount, tier: "TRIAGE" } });
  };

  return (
    <section className="pt-40 pb-32 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      <div className="flex flex-col text-center items-center justify-center">
        <h1 className="text-8xl mb-8">Built for developers</h1>
        <p className="text-muted-foreground text-xl">Simple pricing for individuals. Volume discounts for teams.</p>
      </div>

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-center mb-8 mt-12">
        <Tabs
          value={isYearly ? "yearly" : "monthly"}
          onValueChange={(value) => setIsYearly(value === "yearly")}
        >
          <TabsList>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            isYearly={isYearly}
            onGetStarted={handleGetStarted}
            isLoading={isLoading}
            isSoloUser={isSoloUser}
            currentTier={currentTier}
            currentBillingYearly={currentBillingYearly}
          />
        ))}
      </div>

      {/* Team card */}
      <TeamCard
        isYearly={isYearly}
        onGetStarted={handleEnterpriseGetStarted}
        isLoading={isLoading}
      />

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Need more than 100 seats? <a href="mailto:enterprise@antiptrn.dev" className="underline hover:text-foreground">Contact us</a>
      </p>
    </section>
  );
}
