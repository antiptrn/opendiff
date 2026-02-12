import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/components/ui/alert-dialog";
import { Button } from "components/components/ui/button";
import { LoadingButton } from "components/components/ui/loading-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { formatDate, getTierName } from "shared/billing";
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
  isReactivating: boolean;
  isCancelling: boolean;
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
  isReactivating,
  isCancelling,
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

          {!hasSubscription && !isLoading ? (
            <Button asChild>
              <Link to={`${import.meta.env.VITE_WEBSITE_URL}/pricing`}>Upgrade</Link>
            </Button>
          ) : (
            hasSubscription && (
              <div className="flex gap-2 mt-6">
                <Button asChild>
                  <Link to={`${import.meta.env.VITE_WEBSITE_URL}/pricing`}>Change Plan</Link>
                </Button>
                {cancelAtPeriodEnd ? (
                  <LoadingButton variant="outline" isLoading={isReactivating} loadingText="Reactivating..." onClick={onReactivate}>
                    Reactivate
                  </LoadingButton>
                ) : (
                  <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
                    Cancel Subscription
                  </Button>
                )}
              </div>
            )
          )}

          {quotaPool && !quotaPool.hasUnlimited && (
            <div className="mt-6">
              <QuotaProgress used={quotaPool.used} total={quotaPool.total} />
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showCancelDialog} onOpenChange={(open) => !isCancelling && setShowCancelDialog(open)}>
        <AlertDialogContent className="!max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll retain access until the end of your current billing period. You can reactivate
              anytime before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <LoadingButton variant="outline" isLoading={isCancelling} loadingText="Cancelling..." onClick={handleCancel}>
              Cancel Subscription
            </LoadingButton>
            <AlertDialogCancel variant="default" disabled={isCancelling}>Keep Subscription</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
