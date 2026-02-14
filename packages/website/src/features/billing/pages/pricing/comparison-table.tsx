import { Badge } from "components";
import { Button } from "components/components/ui/button";
import { Check, X } from "lucide-react";
import type { SubscriptionTier } from "shared/auth";
import { plans } from "shared/billing";

type CellValue = true | false | string;

const comparisonRows: { feature: string; values: [CellValue, CellValue, CellValue] }[] = [
  { feature: "Repositories", values: ["Unlimited", "Unlimited", "Unlimited"] },
  { feature: "Monthly tokens", values: ["Unlimited", "2.5M", "8M"] },
  { feature: "Support", values: ["Community", "Email", "Priority"] },
  { feature: "Comment responses", values: [true, true, true] },
  { feature: "Auto-fix", values: [true, true, true] },
  { feature: "Priority reviews", values: [false, true, true] },
  { feature: "Custom review rules", values: [true, true, true] },
  { feature: "Skills", values: [true, true, true] },
  { feature: "Requires your API key", values: [true, false, false] },
];

export function ComparisonTable({
  isYearly,
  onGetStarted,
}: {
  isYearly: boolean;
  onGetStarted: (tier: SubscriptionTier) => void;
}) {
  return (
    <div className="relative z-10 mt-16 md:flex hidden">
      <table className="isolate w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[25%]" />
          <col className="w-[25%]" />
          <col className="w-[25%]" />
          <col className="w-[25%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th
              rowSpan={3}
              className="bg-background text-left align-top text-2xl font-normal tracking-tight"
            >
              <div className="max-w-[16ch] py-6">
                <h3>Compare plans</h3>
                <p className="text-muted-foreground mt-3 text-base">
                  Find the perfect plan for your team.
                </p>
              </div>
            </th>
            {plans.map((plan) => (
              <th
                key={plan.tier}
                className={`text-left text-lg font-normal rounded-t-2xl ${plan.popular ? "bg-card" : "bg-background"}`}
              >
                <div className="px-6 pb-3 pt-6 flex items-center gap-3">
                  <h3>{plan.name}</h3>
                  {plan.popular && <Badge variant="secondary">Popular</Badge>}
                </div>
              </th>
            ))}
          </tr>
          <tr>
            {plans.map((plan) => (
              <th
                key={plan.tier}
                className={`text-left align-top text-2xl font-normal tracking-tighter ${plan.popular ? "bg-card" : "bg-background"}`}
              >
                <div className="px-6 pb-6">
                  $
                  {isYearly
                    ? (Math.round((plan.yearlyPrice / 12) * 2) / 2).toFixed(2)
                    : plan.monthlyPrice}
                  /mo
                </div>
              </th>
            ))}
          </tr>
          <tr>
            {plans.map((plan) => (
              <th
                key={plan.tier}
                className={`text-left ${plan.popular ? "bg-card" : "bg-background"}`}
              >
                <div className="flex px-6 pb-6 w-full">
                  <Button
                    variant={plan.popular ? "default" : "outline"}
                    className="w-full"
                    onClick={() => onGetStarted(plan.tier)}
                  >
                    Get started
                  </Button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(n+2)]:border-t [&>tr:nth-child(n+2)]:border-border">
          {comparisonRows.map((row, rowIndex) => (
            <tr key={row.feature}>
              <th className="text-left">
                <div className="flex items-center gap-2 py-3 text-sm font-normal">
                  {row.feature}
                </div>
              </th>
              {row.values.map((value, i) => {
                const isPopular = plans[i]?.popular;
                const isLastRow = rowIndex === comparisonRows.length - 1;
                return (
                  <td
                    key={plans[i]?.tier}
                    className={`text-sm ${isPopular ? "bg-card" : ""} ${isPopular && isLastRow ? "rounded-b-2xl" : ""}`}
                  >
                    <div
                      className={`flex items-center px-6 ${isPopular && isLastRow ? "pt-3 pb-6" : ""}`}
                    >
                      {value === true ? (
                        <Check className={`h-5 w-5 ${isPopular ? "text-foreground" : ""}`} />
                      ) : value === false ? (
                        <X className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <span className={isPopular ? "text-foreground" : "text-muted-foreground"}>
                          {value}
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
