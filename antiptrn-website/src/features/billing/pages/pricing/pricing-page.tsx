import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs";
import type { SubscriptionTier } from "@features/auth";
import { useAuth } from "@features/auth";
import { useOrganization, useManageSubscription } from "@modules/organizations";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlanCard } from "./plan-card";
import { TeamCard } from "./team-card";
import { plans } from "./pricing.constants";

/** Main pricing page component */
export function PricingPage() {
  const { user, login } = useAuth();
  const { currentOrgId, subscription, orgDetails } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const isSoloUser = user?.accountType === "SOLO";
  const orgId = currentOrgId || user?.organizations?.[0]?.id || null;
  const manageSubscription = useManageSubscription(orgId);

  const currentTier = isSoloUser ? subscription?.tier || null : null;
  const currentBillingYearly =
    isSoloUser && orgDetails?.subscription?.expiresAt
      ? (() => {
          const expiresAt = new Date(orgDetails.subscription.expiresAt);
          const now = new Date();
          const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return daysUntilExpiry > 60;
        })()
      : undefined;

  /** Handles plan selection for individual plans */
  const handleGetStarted = async (tier: SubscriptionTier) => {
    if (!user) {
      sessionStorage.setItem("pricing_tier", tier);
      sessionStorage.setItem("pricing_billing", isYearly ? "yearly" : "monthly");
      login();
      return;
    }

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
        } else {
          // Subscription updated in place - wait for data to refetch before clearing loading
          await queryClient.refetchQueries({ queryKey: ["organization", user?.visitorId, orgId] });
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to create checkout:", error);
        setIsLoading(false);
      }
      return;
    }

    navigate("/console/settings/organization");
  };

  /** Handles team plan selection with seat count */
  const handleEnterpriseGetStarted = async (seatCount: number) => {
    if (!user) {
      sessionStorage.setItem("pricing_seat_count", String(seatCount));
      sessionStorage.setItem("pricing_tier", "TRIAGE");
      sessionStorage.setItem("pricing_billing", isYearly ? "yearly" : "monthly");
      login();
      return;
    }

    navigate("/console/settings/organization", { state: { seatCount, tier: "TRIAGE" } });
  };

  return (
    <section className="pt-40 pb-32 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      <div className="flex flex-col text-center items-center justify-center">
        <h1 className="text-8xl mb-8">Built for developers</h1>
        <p className="text-muted-foreground text-xl">
          Simple pricing for individuals. Volume discounts for teams.
        </p>
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

      <TeamCard
        isYearly={isYearly}
        onGetStarted={handleEnterpriseGetStarted}
        isLoading={isLoading}
      />

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Need more than 100 seats?{" "}
        <a href="mailto:enterprise@antiptrn.dev" className="underline hover:text-foreground">
          Contact us
        </a>
      </p>
    </section>
  );
}
