import type { useAuth } from "@features/auth";
import { useBilling, useCancelSubscription, useResubscribe } from "@features/billing";
import { useOrganization } from "@modules/organizations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/components/ui/alert-dialog";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/components/ui/card";
import { Separator } from "@shared/components/ui/separator";
import { Skeleton } from "@shared/components/ui/skeleton";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, getTierName } from "../lib/utils";
import { BillingHistoryCard } from "./billing-history-card";

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
  const cancelSubscription = useCancelSubscription(user?.access_token, orgId);
  const resubscribe = useResubscribe(user?.access_token, orgId);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

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
              Cancel Cubscription
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
