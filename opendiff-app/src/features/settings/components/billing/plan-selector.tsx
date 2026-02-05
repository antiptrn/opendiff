import NumberFlow from "@number-flow/react";
import { Button } from "opendiff-components/components/ui/button";
import { Separator } from "opendiff-components/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "opendiff-components/components/ui/tabs";
import type { SubscriptionTier } from "opendiff-shared/auth";
import { useState } from "react";
import { PlanCard, plans } from "opendiff-shared/billing";

/** Props for PlanSelector including the subscription callback and loading state. */
interface PlanSelectorProps {
  onManageSubscription: (
    tier: "BYOK" | "CODE_REVIEW" | "TRIAGE",
    billing: "monthly" | "yearly",
    seatCount: number
  ) => Promise<void>;
  isManaging: boolean;
}

/** Plan selection UI with billing period toggle, seat count picker, and plan cards for checkout. */
export function PlanSelector({ onManageSubscription, isManaging }: PlanSelectorProps) {
  const [initialSeatCount, setInitialSeatCount] = useState(1);
  const [isYearly, setIsYearly] = useState(true);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);

  return (
    <div className="space-y-6">
      <Separator />
      <div className="flex items-center justify-between">
        <Tabs
          value={isYearly ? "yearly" : "monthly"}
          onValueChange={(value) => setIsYearly(value === "yearly")}
        >
          <TabsList className="!bg-background shadow-none">
            <TabsTrigger className="data-active:!bg-card" value="monthly">
              Monthly
            </TabsTrigger>
            <TabsTrigger className="data-active:!bg-card" value="yearly">
              Yearly
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setInitialSeatCount(Math.max(1, initialSeatCount - 1))}
            disabled={initialSeatCount <= 1}
          >
            <span className="text-lg">-</span>
          </Button>
          <NumberFlow value={initialSeatCount} className="text-xl min-w-[40px] text-center" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setInitialSeatCount(Math.min(100, initialSeatCount + 1))}
            disabled={initialSeatCount >= 100}
          >
            <span className="text-lg">+</span>
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            isYearly={isYearly}
            seatCount={initialSeatCount}
            className="bg-background"
            buttonText="Checkout"
            roundedButton={false}
            onGetStarted={(tier) => {
              setSelectedTier(tier);
              onManageSubscription(
                tier as "BYOK" | "CODE_REVIEW" | "TRIAGE",
                isYearly ? "yearly" : "monthly",
                initialSeatCount
              );
            }}
            isLoading={isManaging && selectedTier === plan.tier}
            disabled={isManaging}
          />
        ))}
      </div>
    </div>
  );
}
