import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import NumberFlow from "@number-flow/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/components/ui/alert-dialog";
import { Button } from "components/components/ui/button";
import { SettingsSection } from "components/components/console";
import { LoadingButton } from "components/components/ui/loading-button";
import { DataTable } from "components/components/ui/data-table";
import { useState } from "react";
import { formatCents, formatDate, tierLabels, tierPrices } from "shared/billing";
import {
  type OrgSubscription,
  usePreviewSeatChange,
  useReactivateSubscription,
  useUpdateOrgSeatCount,
} from "shared/organizations";
import { toast } from "sonner";
import { PlanSelector } from "./plan-selector";
import { QuotaProgress } from "./quota-progress";
import { SeatChangePreview } from "./seat-change-preview";

interface QuotaPool {
  used: number;
  total: number;
  hasUnlimited: boolean;
}

interface TeamSubscriptionCardProps {
  subscription: OrgSubscription | null;
  isLoading: boolean;
  assignedSeats: number;
  quotaPool?: QuotaPool | null;
  orgId: string | null;
  onManageSubscription: (
    tier: "SELF_SUFFICIENT" | "PRO" | "ULTRA",
    billing: "monthly" | "yearly",
    seatCount: number
  ) => Promise<void>;
  onCancelSubscription: () => Promise<void>;
  onReactivateSubscription: () => Promise<void>;
  isReactivating: boolean;
  isCancelPending: boolean;
  isManaging: boolean;
}

/**
 * Team subscription management card with integrated seat management
 */
export function TeamSubscriptionCard({
  subscription,
  isLoading,
  assignedSeats,
  quotaPool,
  orgId,
  onManageSubscription,
  onCancelSubscription,
  onReactivateSubscription,
  isReactivating,
  isCancelPending,
  isManaging,
}: TeamSubscriptionCardProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  // Seat management state
  const currentSeatCount = subscription?.seatCount ?? 0;
  const [pendingSeatCount, setPendingSeatCount] = useState<number | null>(null);
  const displaySeatCount = pendingSeatCount ?? currentSeatCount;
  const hasChanges = pendingSeatCount !== null && pendingSeatCount !== currentSeatCount;
  const isAddingSeats =
    hasChanges && pendingSeatCount !== null && pendingSeatCount > currentSeatCount;
  const isCancelling = subscription?.cancelAtPeriodEnd ?? false;
  const willReactivate = isCancelling && isAddingSeats;
  const pricePerSeat = tierPrices[subscription?.tier ?? "PRO"] ?? 19;

  // Seat management hooks
  const previewCount = hasChanges ? pendingSeatCount : null;
  const { data: preview, isLoading: isLoadingPreview } = usePreviewSeatChange(orgId, previewCount);
  const updateSeatCountMutation = useUpdateOrgSeatCount(orgId);
  const reactivateSubscriptionMutation = useReactivateSubscription(orgId);

  const handleCancel = async () => {
    await onCancelSubscription();
    setShowCancelDialog(false);
  };

  const handleIncrement = () => {
    const newCount = Math.min(100, displaySeatCount + 1);
    setPendingSeatCount(newCount);
  };

  const handleDecrement = () => {
    const minSeats = Math.max(1, assignedSeats);
    const newCount = Math.max(minSeats, displaySeatCount - 1);
    setPendingSeatCount(newCount);
  };

  const handleConfirmUpdate = async () => {
    if (pendingSeatCount === null) return;

    try {
      if (willReactivate) {
        await reactivateSubscriptionMutation.mutateAsync();
      }
      await updateSeatCountMutation.mutateAsync(pendingSeatCount);
      setShowUpdateDialog(false);
      setPendingSeatCount(null);
      toast.success("Seat count updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update seats");
    }
  };

  const isUpdatingSeats =
    updateSeatCountMutation.isPending || reactivateSubscriptionMutation.isPending;

  const isActive = subscription?.status === "ACTIVE";

  return (
    <SettingsSection title="Team subscription" description="Your team's plan and seats" fullBleed>
      <div>
        <DataTable
          label="Team subscription"
          loading={isLoading}
          skeletonRows={1}
          rows={[subscription]}
          getKey={() => "subscription"}
          columns={[
            {
              key: "plan",
              header: "Plan",
              cell: (current) => (current && isActive ? tierLabels[current.tier] : "None"),
            },
            {
              key: "status",
              header: "Status",
              cell: (current) =>
                !current || !isActive ? (
                  <span className="text-muted-foreground">No active subscription</span>
                ) : current.cancelAtPeriodEnd ? (
                  <span className="text-orange-600 dark:text-orange-400">Cancelling</span>
                ) : (
                  <span className="text-green-600 dark:text-green-400">Active</span>
                ),
            },
            {
              key: "seats",
              header: "Seats",
              cell: () =>
                isActive ? (
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove a seat"
                      onClick={handleDecrement}
                      disabled={displaySeatCount <= Math.max(1, assignedSeats)}
                    >
                      -
                    </Button>
                    <NumberFlow value={displaySeatCount} className="min-w-6 text-center tabular-nums" />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Add a seat"
                      onClick={handleIncrement}
                      disabled={displaySeatCount >= 100}
                    >
                      +
                    </Button>
                    <span className="ml-2 text-muted-foreground">{assignedSeats} assigned</span>
                  </span>
                ) : (
                  "—"
                ),
            },
            {
              key: "billing",
              header: subscription?.cancelAtPeriodEnd ? "Access until" : "Next billing",
              cell: (current) =>
                isActive && current?.expiresAt ? formatDate(current.expiresAt) : "—",
            },
            {
              key: "actions",
              header: <span className="sr-only">Actions</span>,
              cell: (current) =>
                isActive && current ? (
                  <span className="flex items-center justify-end gap-2">
                    {current.cancelAtPeriodEnd ? (
                      <LoadingButton
                        size="sm"
                        isLoading={isReactivating}
                        loadingText="Reactivating..."
                        onClick={onReactivateSubscription}
                      >
                        Reactivate
                      </LoadingButton>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          onClick={() => setShowUpdateDialog(true)}
                          disabled={!hasChanges || isUpdatingSeats}
                        >
                          {isUpdatingSeats && (
                            <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" />
                          )}
                          {willReactivate ? "Update & Reactivate" : "Update seats"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowCancelDialog(true)}>
                          Cancel
                        </Button>
                      </>
                    )}
                  </span>
                ) : null,
            },
          ]}
        />

        {/* Under the table: the price change for pending seats, usage, or the plans to pick */}
        {isActive && hasChanges && (
          <div className="border-t border-border-solid px-4 py-4">
            <SeatChangePreview
              hasChanges={hasChanges}
              willReactivate={willReactivate}
              isLoadingPreview={isLoadingPreview}
              preview={preview ?? null}
              displaySeatCount={displaySeatCount}
              pricePerSeat={pricePerSeat}
            />
          </div>
        )}

        {quotaPool && !quotaPool.hasUnlimited && quotaPool.total !== -1 && (
          <div className="border-t border-border-solid px-4 py-4">
            <QuotaProgress used={quotaPool.used} total={quotaPool.total} />
          </div>
        )}

        {!isActive && !isLoading && (
          <div className="border-t border-border-solid px-4 py-4">
            <PlanSelector onManageSubscription={onManageSubscription} isManaging={isManaging} />
          </div>
        )}

        <AlertDialog
          open={showCancelDialog}
          onOpenChange={(open) => !isCancelPending && setShowCancelDialog(open)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
              <AlertDialogDescription>
                All members will lose access at the end of the current billing period. You can
                reactivate anytime before then.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <LoadingButton
                variant="outline"
                isLoading={isCancelPending}
                loadingText="Cancelling..."
                onClick={handleCancel}
              >
                Cancel Subscription
              </LoadingButton>
              <AlertDialogCancel variant="default" disabled={isCancelPending}>
                Keep Subscription
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Update Seats Confirmation Dialog */}
        <AlertDialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {willReactivate ? "Confirm Seat Change & Reactivation" : "Confirm Seat Change"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    You are changing from {currentSeatCount} to {pendingSeatCount}{" "}
                    {pendingSeatCount === 1 ? "seat" : "seats"}.
                  </p>
                  {willReactivate && (
                    <p className="text-green-600">This will also reactivate your subscription.</p>
                  )}
                  {preview && preview.proratedCharge !== 0 && (
                    <p>
                      {preview.proratedCharge > 0 ? (
                        <>
                          You will be charged{" "}
                          <span className="font-medium">{formatCents(preview.proratedCharge)}</span>{" "}
                          today (prorated).
                        </>
                      ) : (
                        <>
                          You will receive a credit of{" "}
                          <span className="font-medium text-green-600">
                            {formatCents(Math.abs(preview.proratedCharge))}
                          </span>{" "}
                          on your next invoice.
                        </>
                      )}
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
              <AlertDialogAction size="sm" onClick={handleConfirmUpdate}>
                {isUpdatingSeats && (
                  <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                )}
                {willReactivate ? "Confirm & Reactivate" : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SettingsSection>
  );
}
