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
import { SettingsRow, SettingsSection } from "components/components/console";
import { LoadingButton } from "components/components/ui/loading-button";
import { Skeleton } from "components/components/ui/skeleton";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatTokenQuota, getTierName } from "shared/billing";

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
      <SettingsSection title="Subscription">
        {isLoading ? (
          <SettingsRow
            title={<Skeleton muted className="h-6 w-24 rounded-md" />}
            description={<Skeleton muted className="h-5 w-48 rounded-md" />}
          >
            <Skeleton muted className="h-10 w-24 rounded-md" />
          </SettingsRow>
        ) : seat && hasSubscription ? (
          <SettingsRow
            title={getTierName(seat.tier)}
            description={
              <>
                {seat.status !== "ACTIVE" ? (
                  <span className="text-orange-600 dark:text-orange-400">{seat.status}</span>
                ) : cancelAtPeriodEnd ? (
                  <span className="text-orange-600 dark:text-orange-400">Cancelling</span>
                ) : (
                  <span className="text-green-600 dark:text-green-400">Active</span>
                )}
                {seat.expiresAt &&
                  ` · ${cancelAtPeriodEnd ? "Access until" : "Renews"} ${formatDate(seat.expiresAt)}`}
              </>
            }
          >
            {cancelAtPeriodEnd ? (
              <LoadingButton
                variant="outline"
                isLoading={isReactivating}
                loadingText="Reactivating..."
                onClick={onReactivate}
              >
                Reactivate
              </LoadingButton>
            ) : (
              <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
                Cancel
              </Button>
            )}
            <Button asChild>
              <Link to={`${import.meta.env.VITE_WEBSITE_URL}/pricing`}>Change plan</Link>
            </Button>
          </SettingsRow>
        ) : (
          <SettingsRow title="Free" description="You're not on a paid plan.">
            <Button asChild>
              <Link to={`${import.meta.env.VITE_WEBSITE_URL}/pricing`}>Upgrade</Link>
            </Button>
          </SettingsRow>
        )}

        {quotaPool && !quotaPool.hasUnlimited && !isLoading && (
          <SettingsRow
            title="Usage"
            description={
              quotaPool.total > 0
                ? `${formatTokenQuota(quotaPool.used)} of ${formatTokenQuota(quotaPool.total)} tokens used this cycle`
                : `${formatTokenQuota(quotaPool.used)} tokens used this cycle`
            }
          >
            {quotaPool.total > 0 && (
              <div className="h-2 w-40 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-yellow transition-all"
                  style={{ width: `${Math.min(100, (quotaPool.used / quotaPool.total) * 100)}%` }}
                />
              </div>
            )}
          </SettingsRow>
        )}
      </SettingsSection>

      <AlertDialog
        open={showCancelDialog}
        onOpenChange={(open) => !isCancelling && setShowCancelDialog(open)}
      >
        <AlertDialogContent className="!max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll retain access until the end of your current billing period. You can reactivate
              anytime before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <LoadingButton
              variant="outline"
              isLoading={isCancelling}
              loadingText="Cancelling..."
              onClick={handleCancel}
            >
              Cancel Subscription
            </LoadingButton>
            <AlertDialogCancel variant="default" disabled={isCancelling}>
              Keep Subscription
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
