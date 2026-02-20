import NumberFlow from "@number-flow/react";
import { Badge, Card, cn } from "components";
import { Button } from "components/components/ui/button";
import { TooltipContent, TooltipRoot, TooltipTrigger } from "components/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, Loader2, X } from "lucide-react";
import type { SubscriptionTier } from "../../auth";
import { formatTokenQuota } from "../format";
import { type Plan, TIER_HIERARCHY } from "../pricing.constants";

interface PlanCardProps {
  plan: Plan;
  isYearly: boolean;
  onGetStarted: (tier: SubscriptionTier) => void;
  isLoading: boolean;
  isSoloUser?: boolean;
  currentTier?: SubscriptionTier | null;
  currentBillingYearly?: boolean;
  seatCount?: number;
  buttonText?: string;
  roundedButton?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Displays a single pricing plan with features and CTA */
export function PlanCard({
  plan,
  isYearly,
  onGetStarted,
  isLoading,
  isSoloUser,
  currentTier,
  currentBillingYearly,
  seatCount = 1,
  buttonText,
  disabled,
  className,
}: PlanCardProps) {
  const pricePerSeat = isYearly ? plan.yearlyPrice / 12 : plan.monthlyPrice;
  const price = pricePerSeat * seatCount;

  /** Determines button text based on current subscription status */
  const getButtonText = () => {
    if (!isSoloUser || !currentTier) return "Get started";

    const currentLevel = TIER_HIERARCHY[currentTier];
    const planLevel = TIER_HIERARCHY[plan.tier];

    if (currentTier === plan.tier) {
      if (currentBillingYearly === isYearly) return "Current Plan";
      return "Switch Billing Cycle";
    }

    if (planLevel > currentLevel) return "Upgrade";
    if (planLevel < currentLevel) return "Downgrade";
    return "Get started";
  };

  /** Determines button variant based on subscription status */
  const getButtonVariant = () => {
    if (!isSoloUser || !currentTier) {
      return plan.popular ? "default" : "outline";
    }

    const currentLevel = TIER_HIERARCHY[currentTier];
    const planLevel = TIER_HIERARCHY[plan.tier];
    const isCurrentPlan = currentTier === plan.tier && currentBillingYearly === isYearly;

    if (isCurrentPlan) return "outline";
    if (planLevel < currentLevel) return "outline";
    if (currentTier === plan.tier && !isYearly) return "outline";
    if (plan.popular) return "default";
    return "default";
  };

  const isCurrentPlan =
    isSoloUser && currentTier === plan.tier && currentBillingYearly === isYearly;

  return (
    <Card className={cn("p-6 flex flex-col gap-0 overflow-visible", className)}>
      <div className="flex items-center gap-3">
        <p className="text-lg">{plan.name}</p>
        {plan.popular && <Badge variant="secondary">Popular</Badge>}
      </div>
      <p className="text-base text-muted-foreground mt-2">{plan.description}</p>

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
              Save{" "}
              <NumberFlow
                value={(plan.monthlyPrice * 12 - plan.yearlyPrice) * seatCount}
                format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
              />
              /year
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <ul className="mt-6 space-y-3 flex-1">
        <li className="flex items-center gap-1.5 text-sm">
          <div className="mr-1">
            <Check className="size-4 shrink-0" />
          </div>
          <span>{plan.features[0].name}</span>
        </li>

        <li className="flex items-center gap-1.5 text-sm">
          <div className="mr-1">
            {plan.monthlyTokenQuota !== 0 ? (
              <Check className="size-4 shrink-0" />
            ) : (
              <X className="size-4 text-muted-foreground shrink-0" />
            )}
          </div>
          <span className={plan.monthlyTokenQuota !== 0 ? "" : "text-muted-foreground"}>
            {plan.monthlyTokenQuota === -1 ? (
              "Unlimited tokens"
            ) : plan.monthlyTokenQuota > 0 ? (
              <>{formatTokenQuota(plan.monthlyTokenQuota)} tokens/month</>
            ) : (
              "No tokens included"
            )}
          </span>
          <TooltipRoot>
            <TooltipTrigger
              delay={0}
              className="text-muted-foreground hover:text-foreground transition-colors p-1.5 -m-1.5"
            >
              <Info className="size-3" />
            </TooltipTrigger>
            <TooltipContent>
              {plan.monthlyTokenQuota === -1
                ? "No limits - you pay Anthropic directly for API usage"
                : plan.monthlyTokenQuota > 0
                  ? "Token usage resets monthly"
                  : "Purchase a seat to enable code reviews"}
            </TooltipContent>
          </TooltipRoot>
        </li>

        {plan.features.slice(1).map((feature) => (
          <li key={feature.name} className="flex items-center gap-1.5 text-sm">
            <div className="mr-1">
              {feature.included ? (
                <Check className="size-4 shrink-0" />
              ) : (
                <X className="size-4 text-muted-foreground shrink-0" />
              )}
            </div>
            <span className={feature.included ? "" : "text-muted-foreground"}>{feature.name}</span>
            {feature.tooltip && (
              <TooltipRoot>
                <TooltipTrigger
                  delay={0}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1.5 -m-1.5"
                >
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
        disabled={isLoading || isCurrentPlan || disabled}
        onClick={() => onGetStarted(plan.tier)}
      >
        {isLoading && <Loader2 className="size-4 animate-spin" />}
        {buttonText ?? getButtonText()}
      </Button>
    </Card>
  );
}
