import { ExternalLink } from "lucide-react";
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
import type { SubscriptionTier } from "shared/auth";
import { PlanCard, plans } from "shared/billing";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ComparisonTable } from "./comparison-table";

const APP_URL = import.meta.env.VITE_APP_URL || "http://localhost:5174";

/** Main pricing page component */
export function PricingPage() {
  const [isYearly, setIsYearly] = useState(true);

  const handleGetStarted = (tier: SubscriptionTier) => {
    const billing = isYearly ? "yearly" : "monthly";
    window.location.href = `${APP_URL}/checkout?tier=${tier}&billing=${billing}`;
  };

  return (
    <section className="relative lg:pt-40 md:pt-40 pt-32 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      {/*
        <div
          aria-hidden="true"
          className="absolute z-0 -top-48 left-1/2 -translate-x-1/2 w-[60%] h-[250px] rounded-full bg-muted blur-3xl pointer-events-none"
        />*/
      }
      <div className="relative z-10 flex flex-col text-center items-center justify-center">
        <Button
          variant="secondary"
          className="lg:mb-6 md:mb-6 mb-4 text-sm font-normal rounded-lg h-auto py-2 px-3.5 gap-2.5"
        >
          Deploy OpenDiff on your own infrastructure
          <ExternalLink className="size-3.5 shrink-0" />
        </Button>
        <h5 className="font-normal max-w-[519px] text-[40px] md:text-[63px] leading-tight pb-1">
          Built for developers
        </h5>
        <p className="lg:text-xl md:text-xl text-base text-muted-foreground max-w-[609px] mx-auto lg:mt-4 md:mt-4 mt-2.5 text-balance leading-7">
          Flexible pricing for every team.
        </p>
      </div>

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
            <Link to="mailto:support@opendiff.dev">Contact Sales</Link>
          </Button>
        </CardContent>
      </Card>
      <Separator className="lg:mt-16 md:mt-16 mt-8 md:flex hidden" />
      <ComparisonTable isYearly={isYearly} onGetStarted={handleGetStarted} />
      <Separator className="lg:mt-16 md:mt-16 mt-8" />
    </section>
  );
}
