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
import { SettingsSection } from "components/components/console";
import { DataTable } from "components/components/ui/data-table";
import { LoadingButton } from "components/components/ui/loading-button";
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
      <SettingsSection title="Subscription" fullBleed>
        <DataTable
          label="Subscription"
          loading={isLoading}
          skeletonRows={1}
          rows={[seat && hasSubscription ? seat : null]}
          getKey={() => "subscription"}
          columns={[
            {
              key: "plan",
              header: "Plan",
              cell: (current) => (current ? getTierName(current.tier) : "Free"),
            },
            {
              key: "status",
              header: "Status",
              cell: (current) =>
                !current ? (
                  <span className="text-muted-foreground">Not subscribed</span>
                ) : current.status !== "ACTIVE" ? (
                  <span className="text-orange-600 dark:text-orange-400">{current.status}</span>
                ) : cancelAtPeriodEnd ? (
                  <span className="text-orange-600 dark:text-orange-400">Cancelling</span>
                ) : (
                  <span className="text-green-600 dark:text-green-400">Active</span>
                ),
            },
            {
              key: "renews",
              header: cancelAtPeriodEnd ? "Access until" : "Renews",
              cell: (current) => (current?.expiresAt ? formatDate(current.expiresAt) : "—"),
            },
            {
              key: "usage",
              header: "Usage this cycle",
              cell: () =>
                !quotaPool || quotaPool.hasUnlimited ? (
                  quotaPool?.hasUnlimited ? "Unlimited" : "—"
                ) : (
                  <span className="flex items-center gap-3">
                    {quotaPool.total > 0
                      ? `${formatTokenQuota(quotaPool.used)} of ${formatTokenQuota(quotaPool.total)} tokens`
                      : `${formatTokenQuota(quotaPool.used)} tokens`}
                    {quotaPool.total > 0 && (
                      <span className="h-1.5 w-24 rounded-full bg-muted">
                        <span
                          className="block h-1.5 rounded-full bg-yellow transition-all"
                          style={{
                            width: `${Math.min(100, (quotaPool.used / quotaPool.total) * 100)}%`,
                          }}
                        />
                      </span>
                    )}
                  </span>
                ),
            },
            {
              key: "actions",
              header: <span className="sr-only">Actions</span>,
              cell: (current) => (
                <span className="flex items-center justify-end gap-2">
                  {current &&
                    (cancelAtPeriodEnd ? (
                      <LoadingButton
                        size="sm"
                        variant="outline"
                        isLoading={isReactivating}
                        loadingText="Reactivating..."
                        onClick={onReactivate}
                      >
                        Reactivate
                      </LoadingButton>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setShowCancelDialog(true)}>
                        Cancel
                      </Button>
                    ))}
                  <Button asChild size="sm">
                    <Link to={`${import.meta.env.VITE_WEBSITE_URL}/pricing`}>
                      {current ? "Change plan" : "Upgrade"}
                    </Link>
                  </Button>
                </span>
              ),
            },
          ]}
        />
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
