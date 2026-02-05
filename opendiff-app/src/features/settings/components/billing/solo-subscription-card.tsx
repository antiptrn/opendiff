import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "opendiff-components/components/ui/alert-dialog";
import { Button } from "opendiff-components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "opendiff-components/components/ui/card";
import { formatDate, getTierName } from "opendiff-components/utils";
import { useState } from "react";
import { Link } from "react-router-dom";
import { QuotaProgress } from "./quota-progress";
import { SubscriptionInfoItem, SubscriptionInfoList } from "./subscription-info-list";

interface QuotaPool {
  used: number;
  total: number;
  hasUnlimited: boolean;
}

interface Seat {
  tier: string | null;
  status: string;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}

interface SoloSubscriptionCardProps {
  seat: Seat | null;
  hasSubscription: boolean;
  isLoading: boolean;
  quotaPool?: QuotaPool | null;
  onCancelSubscription: () => Promise<void>;
  onReactivate: () => Promise<void>;
}

/**
 * Solo user subscription card
 */
export function SoloSubscriptionCard({
  seat,
  hasSubscription,
  isLoading,
  quotaPool,
  onCancelSubscription,
  onReactivate,
}: SoloSubscriptionCardProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const cancelAtPeriodEnd = seat?.cancelAtPeriodEnd;

  const handleCancel = async () => {
    await onCancelSubscription();
    setShowCancelDialog(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          {!hasSubscription && !isLoading && (
            <CardDescription>No subscription found</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <SubscriptionInfoList isLoading={isLoading}>
            {seat && hasSubscription && (
              <>
                <SubscriptionInfoItem label="Status">
                  {seat.status === "ACTIVE" ? (
                    <span className="inline-flex items-center gap-1.5">
                      {cancelAtPeriodEnd ? (
                        <p className="text-orange-600 dark:text-orange-400">Cancelling</p>
                      ) : (
                        <p className="text-green-600 dark:text-green-400">Active</p>
                      )}
                    </span>
                  ) : (
                    <span className="text-orange-600 dark:text-orange-400">{seat.status}</span>
                  )}
                </SubscriptionInfoItem>
                <SubscriptionInfoItem label="Plan" separator={!!seat.expiresAt}>
                  {getTierName(seat.tier)}
                </SubscriptionInfoItem>
                {seat.expiresAt && (
                  <SubscriptionInfoItem
                    label={cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                    separator={false}
                  >
                    {formatDate(seat.expiresAt)}
                  </SubscriptionInfoItem>
                )}
              </>
            )}
          </SubscriptionInfoList>

          {hasSubscription && quotaPool && !quotaPool.hasUnlimited && quotaPool.total !== -1 && (
            <div className="mt-4">
              <QuotaProgress used={quotaPool.used} total={quotaPool.total} />
            </div>
          )}

          {!hasSubscription && !isLoading ? (
            <Button asChild>
              <Link to={`${import.meta.env.VITE_WEBSITE_URL}/pricing`}>Upgrade</Link>
            </Button>
          ) : (
            hasSubscription && (
              <div className="flex gap-2 mt-6">
                <Button asChild>
                  <Link to="/pricing">Change Plan</Link>
                </Button>
                {cancelAtPeriodEnd ? (
                  <Button variant="outline" onClick={onReactivate}>
                    Reactivate
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
                    Cancel Subscription
                  </Button>
                )}
              </div>
            )
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent className="!max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll retain access until the end of your current billing period. You can reactivate
              anytime before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant="outline" onClick={handleCancel}>
              Cancel Subscription
            </AlertDialogAction>
            <AlertDialogCancel variant="default">Keep Subscription</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
