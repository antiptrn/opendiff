import type { SubscriptionTier, useAuth } from "@features/auth";
import { PlanCard, plans, useBilling, useCancelSubscription, useResubscribe } from "@features/billing";
import {
  useCancelOrgSubscription,
  useManageSubscription,
  useOrganization,
  useOrganizationMembers,
  useReactivateSubscription,
} from "@modules/organizations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@shared/components/ui/alert-dialog";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/components/ui/card";
import { Separator } from "@shared/components/ui/separator";
import { Skeleton } from "@shared/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs";
import NumberFlow from "@number-flow/react";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, getTierName, tierLabels } from "../lib/utils";
import { BillingHistoryCard } from "./billing-history-card";
import { SeatManagementCard } from "./seat-management-card";

interface BillingTabProps {
  user: ReturnType<typeof useAuth>["user"];
  orgId?: string | null;
  isSoloUser?: boolean;
}

/**
 * Billing tab - shows subscription details, seat management (for teams), and billing history
 */
export function BillingTab({ user, orgId, isSoloUser }: BillingTabProps) {
  // Solo user billing hooks
  const { currentSeat, hasSeat, subscription, seats, orgDetails } = useOrganization();
  const { isLoading } = useBilling(user?.access_token, orgId);
  const cancelSubscription = useCancelSubscription(user?.access_token, orgId);
  const resubscribe = useResubscribe(user?.access_token, orgId);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Team billing hooks
  const { data: membersData } = useOrganizationMembers(orgId);
  const quotaPool = membersData?.quotaPool || orgDetails?.quotaPool;
  const seatsInfo = membersData?.seats || seats;
  const manageSubscriptionMutation = useManageSubscription(orgId);
  const cancelOrgSubscriptionMutation = useCancelOrgSubscription(orgId);
  const reactivateSubscriptionMutation = useReactivateSubscription(orgId);

  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [initialSeatCount, setInitialSeatCount] = useState(1);
  const [isYearly, setIsYearly] = useState(true);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const [showTeamCancelDialog, setShowTeamCancelDialog] = useState(false);

  const hasSubscription = hasSeat && currentSeat?.tier;
  const cancelAtPeriodEnd = currentSeat?.cancelAtPeriodEnd;

  const handleCancelSubscription = async () => {
    try {
      await cancelSubscription.mutateAsync();
      setShowCancelDialog(false);
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
    }
  };

  const handleReactivate = async () => {
    try {
      await resubscribe.mutateAsync();
    } catch (error) {
      console.error("Failed to reactivate subscription:", error);
    }
  };

  // Team subscription handlers
  const handleManageSubscription = async (
    tier: "BYOK" | "CODE_REVIEW" | "TRIAGE",
    billing: "monthly" | "yearly",
    seatCount: number
  ) => {
    setSubscriptionError(null);
    try {
      const result = await manageSubscriptionMutation.mutateAsync({ tier, billing, seatCount });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (error) {
      setSubscriptionError(
        error instanceof Error ? error.message : "Failed to manage subscription"
      );
    }
  };

  const handleCancelOrgSubscription = async () => {
    try {
      await cancelOrgSubscriptionMutation.mutateAsync();
      setShowTeamCancelDialog(false);
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
    }
  };

  const handleReactivateOrgSubscription = async () => {
    try {
      await reactivateSubscriptionMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to reactivate subscription:", error);
    }
  };

  const assignedSeats = membersData?.members?.filter((m) => m.hasSeat).length ?? 0;
  const availableSeats = seatsInfo?.available ?? 0;

  // Render team billing for non-solo users
  if (!isSoloUser) {
    return (
      <div className="space-y-6">
        {/* Team Subscription Card */}
        <Card>
          <CardHeader>
            <CardTitle>Team Subscription</CardTitle>
            <CardDescription>Manage your team's subscription and seats</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription?.status === "ACTIVE" ? (
              <>
                <dl className="text-sm">
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground text-base">Status</dt>
                    <dd>
                      {subscription.cancelAtPeriodEnd ? (
                        <span className="text-orange-600 dark:text-orange-400">Cancelling</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">Active</span>
                      )}
                    </dd>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground text-base">Plan</dt>
                    <dd>{tierLabels[subscription.tier]}</dd>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground text-base">Seats</dt>
                    <dd>
                      {assignedSeats} of {subscription.seatCount} assigned
                      {availableSeats > 0 && ` (${availableSeats} available)`}
                    </dd>
                  </div>
                  {subscription.expiresAt && (
                    <>
                      <Separator className="my-4" />
                      <div className="flex justify-between items-center">
                        <dt className="text-muted-foreground text-base">
                          {subscription.cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                        </dt>
                        <dd>{formatDate(subscription.expiresAt)}</dd>
                      </div>
                    </>
                  )}
                </dl>
                {quotaPool && (
                  <div className="pt-4 border-t">
                    {quotaPool.hasUnlimited || quotaPool.total === -1 ? (
                      <p className="text-base">Unlimited reviews (BYOK)</p>
                    ) : (
                      <>
                        <p className="text-sm">
                          {quotaPool.used} / {quotaPool.total} reviews used this cycle
                        </p>
                        <div className="w-full bg-muted rounded-full h-2 mt-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (quotaPool.used / quotaPool.total) * 100)}%`,
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="flex gap-2 mt-6">
                  {subscription.cancelAtPeriodEnd ? (
                    <Button onClick={handleReactivateOrgSubscription}>Reactivate</Button>
                  ) : (
                    <AlertDialog open={showTeamCancelDialog} onOpenChange={setShowTeamCancelDialog}>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline">Cancel subscription</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                          <AlertDialogDescription>
                            All members will lose access at the end of the current billing period. You can reactivate anytime before then.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogAction variant="outline" onClick={handleCancelOrgSubscription}>
                            Cancel Subscription
                          </AlertDialogAction>
                          <AlertDialogCancel variant="default">Keep Subscription</AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </>
            ) : (
              <div>
                <p className="text-base text-muted-foreground pb-4">
                  No active subscription
                </p>
                <div className="flex flex-col gap-6">
                  {/* Billing cycle and seat count */}
                  <div className="flex items-center justify-between">
                    <Tabs
                      value={isYearly ? "yearly" : "monthly"}
                      onValueChange={(value) => setIsYearly(value === "yearly")}
                    >
                      <TabsList>
                        <TabsTrigger value="monthly">Monthly</TabsTrigger>
                        <TabsTrigger value="yearly">Yearly</TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {/* Seat count selector */}
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => setInitialSeatCount(Math.max(1, initialSeatCount - 1))}
                        disabled={initialSeatCount <= 1}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <div className="flex items-baseline gap-1.5 min-w-[60px] justify-center">
                        <NumberFlow
                          value={initialSeatCount}
                          className="text-xl font-semibold"
                        />
                        <span className="text-sm text-muted-foreground">
                          {initialSeatCount === 1 ? "seat" : "seats"}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => setInitialSeatCount(Math.min(100, initialSeatCount + 1))}
                        disabled={initialSeatCount >= 100}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Plan cards */}
                  <div className="grid md:grid-cols-3 gap-4">
                    {plans.map((plan) => (
                      <PlanCard
                        key={plan.tier}
                        plan={plan}
                        isYearly={isYearly}
                        seatCount={initialSeatCount}
                        buttonText="Checkout"
                        roundedButton={false}
                        onGetStarted={(tier) => {
                          setSelectedTier(tier);
                          handleManageSubscription(
                            tier as "BYOK" | "CODE_REVIEW" | "TRIAGE",
                            isYearly ? "yearly" : "monthly",
                            initialSeatCount
                          );
                        }}
                        isLoading={manageSubscriptionMutation.isPending && selectedTier === plan.tier}
                        disabled={manageSubscriptionMutation.isPending}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {subscriptionError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {subscriptionError}
          </div>
        )}

        {/* Seat Management - show when subscription is active */}
        {subscription?.status === "ACTIVE" && (
          <SeatManagementCard orgId={orgId} subscription={subscription} seats={seatsInfo} />
        )}

        {/* Billing History */}
        <BillingHistoryCard user={user} orgId={orgId} isSoloUser={isSoloUser} />
      </div>
    );
  }

  // Solo user billing (original implementation)
  return (
    <div className="space-y-6">

      {/* Subscription Details */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          {!hasSubscription && (
            <CardDescription
            >
              No subscription found
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <dl className="text-sm">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Separator className="my-3" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Separator className="my-3" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            </dl>
          ) : currentSeat && hasSubscription && (
            <dl className="text-sm">
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground text-base">Status</dt>
                <dd>
                  {currentSeat.status === "ACTIVE" ? (
                    <span className="inline-flex items-center gap-1.5">
                      {cancelAtPeriodEnd ? (
                        <p
                          className="text-orange-600 dark:text-orange-400"
                        >
                          Cancelling
                        </p>
                      ) : (
                        <p
                          className="text-green-600 dark:text-green-400"
                        >
                          Active
                        </p>
                      )}
                    </span>
                  ) : (
                    <span className="text-orange-600 dark:text-orange-400">
                      {currentSeat.status}
                    </span>
                  )}
                </dd>
              </div>
              <Separator className="my-4" />
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground text-base">Plan</dt>
                <dd>{getTierName(currentSeat.tier)}</dd>
              </div>
              {currentSeat.expiresAt && (
                <>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground text-base">
                      {cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                    </dt>
                    <dd>{formatDate(currentSeat.expiresAt)}</dd>
                  </div>
                </>
              )}
            </dl>
          )}
          {!hasSubscription && !isLoading ? (
            <Button asChild>
              <Link to="/pricing">Upgrade</Link>
            </Button>
          ) : hasSubscription && isSoloUser && (
            <div className="flex gap-2 mt-6">
              <Button asChild>
                <Link to="/pricing">Change Plan</Link>
              </Button>
              {cancelAtPeriodEnd ? (
                <Button variant="outline" onClick={handleReactivate}>
                  Reactivate
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
                  Cancel Subscription
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll retain access until the end of your current billing period. You can reactivate anytime before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant="outline" onClick={handleCancelSubscription}>
              Cancel Subscription
            </AlertDialogAction>
            <AlertDialogCancel variant="default">Keep Subscription</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Billing History */}
      <BillingHistoryCard user={user} orgId={orgId} isSoloUser={isSoloUser} />
    </div>
  );
}
