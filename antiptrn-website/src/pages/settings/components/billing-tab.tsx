import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useBilling } from "@/hooks/use-api";
import { useOrganization } from "@/hooks/use-organization";
import type { useAuth } from "@/hooks/use-auth";
import { BillingHistoryCard } from "./billing-history-card";
import { formatDate, getTierName } from "../utils";

interface BillingTabProps {
  user: ReturnType<typeof useAuth>["user"];
  orgId?: string | null;
  isSoloUser?: boolean;
}

/**
 * Billing tab for solo users - shows current plan, subscription details, and billing history
 */
export function BillingTab({ user, orgId, isSoloUser }: BillingTabProps) {
  const { currentSeat, hasSeat } = useOrganization();
  const { isLoading } = useBilling(user?.access_token, orgId);

  const hasSubscription = hasSeat && currentSeat?.tier;
  const cancelAtPeriodEnd = currentSeat?.cancelAtPeriodEnd;

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-lg">{getTierName(currentSeat?.tier)}</p>
                {hasSubscription ? (
                  cancelAtPeriodEnd ? (
                    <p className="text-sm text-orange-600 dark:text-orange-400">
                      Cancels {formatDate(currentSeat?.expiresAt)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Renews {formatDate(currentSeat?.expiresAt)}
                    </p>
                  )
                ) : (
                  <p className="text-base text-muted-foreground">You're on the free plan</p>
                )}
              </div>

              {!hasSubscription && (
                <Button asChild>
                  <Link to="/pricing">Upgrade</Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription Details - only show when user has a subscription */}
      {(hasSubscription || isLoading) && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription Details</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </dl>
            ) : currentSeat && hasSubscription ? (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    {currentSeat.status === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1.5">
                        {cancelAtPeriodEnd ? (
                          <Badge
                            variant="secondary"
                            className="bg-orange-600/10 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400"
                          >
                            Cancelling
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400"
                          >
                            Active
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-orange-600 dark:text-orange-400">
                        {currentSeat.status}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd>{getTierName(currentSeat.tier)}</dd>
                </div>
                {currentSeat.expiresAt && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                    </dt>
                    <dd>{formatDate(currentSeat.expiresAt)}</dd>
                  </div>
                )}
              </dl>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Billing History */}
      <BillingHistoryCard user={user} orgId={orgId} isSoloUser={isSoloUser} />
    </div>
  );
}
