import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from "components";
import { Tabs, TabsList, TabsTrigger } from "components/components/ui/tabs";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { SubscriptionTier } from "shared/auth";
import { PlanCard, plans } from "shared/billing";
import { ComparisonTable } from "./comparison-table";
import { PageContainer } from "./page-container";
import { PageHeader } from "./page-header";

const APP_URL = import.meta.env.VITE_APP_URL || "http://localhost:5174";

/** Main pricing page component */
export function PricingPage() {
  const [isYearly, setIsYearly] = useState(true);

  const handleGetStarted = (tier: SubscriptionTier) => {
    const billing = isYearly ? "yearly" : "monthly";
    window.location.href = `${APP_URL}/checkout?tier=${tier}&billing=${billing}`;
  };

  return (
    <PageContainer>
      <PageHeader title="Built for developers" subtitle="Flexible pricing for every team." />

      {/* Billing cycle toggle */}
      <div className="relative z-10 flex items-center justify-center mb-8 lg:mt-9 md:mt-9 mt-7">
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

      <div className="relative z-10 grid md:grid-cols-3 gap-6 mb-6">
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
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Enterprise</CardTitle>
          <CardDescription>
            Looking for something else? Contact Sales and get a quote.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="mailto:sales@opendiff.dev">Contact Sales</Link>
          </Button>
        </CardContent>
      </Card>
      <Separator className="lg:mt-16 md:mt-16 mt-8 md:flex hidden" />
      <ComparisonTable isYearly={isYearly} onGetStarted={handleGetStarted} />
    </PageContainer>
  );
}
