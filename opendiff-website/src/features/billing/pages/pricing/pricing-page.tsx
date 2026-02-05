import { Tabs, TabsList, TabsTrigger } from "opendiff-components/components/ui/tabs";
import type { SubscriptionTier } from "opendiff-shared/auth";
import { useState } from "react";
import { PlanCard, plans } from "opendiff-shared/billing";

const APP_URL = import.meta.env.VITE_APP_URL || "http://localhost:5174";

/** Main pricing page component */
export function PricingPage() {
  const [isYearly, setIsYearly] = useState(true);

  const handleGetStarted = (tier: SubscriptionTier) => {
    const billing = isYearly ? "yearly" : "monthly";
    window.location.href = `${APP_URL}/checkout?tier=${tier}&billing=${billing}`;
  };

  return (
    <section className="lg:pt-40 md:pt-40 pt-30 pb-20 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      <div className="flex flex-col text-center items-center justify-center">
        <h1 className="lg:text-8xl md:text-6xl text-4xl lg:mb-8 md:mb-6 mb-4">
          Built for developers
        </h1>
        <p className="text-muted-foreground text-xl">Transparent pricing for everyone.</p>
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
            className="shadow-md dark:shadow-none"
            key={plan.tier}
            plan={plan}
            isYearly={isYearly}
            onGetStarted={handleGetStarted}
            isLoading={false}
          />
        ))}
      </div>
    </section>
  );
}
