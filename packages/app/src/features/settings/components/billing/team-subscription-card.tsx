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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { LoadingButton } from "components/components/ui/loading-button";
import { Separator } from "components/components/ui/separator";
import { Loader2 } from "lucide-react";
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
import { SubscriptionInfoItem, SubscriptionInfoList } from "./subscription-info-list";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Subscription</CardTitle>
        <CardDescription>Manage your team's subscription and seats</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SubscriptionInfoList isLoading={isLoading}>
          {subscription?.status === "ACTIVE" ? (
            <>
              <SubscriptionInfoItem label="Status">
                {subscription.cancelAtPeriodEnd ? (
                  <span className="text-orange-600 dark:text-orange-400">Cancelling</span>
                ) : (
                  <span className="text-green-600 dark:text-green-400">Active</span>
                )}
              </SubscriptionInfoItem>
              <SubscriptionInfoItem label="Plan">
                {tierLabels[subscription.tier]}
              </SubscriptionInfoItem>
              <SubscriptionInfoItem label="Seats" separator={false}>
                <div className="flex items-center">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={handleDecrement}
                    disabled={displaySeatCount <= Math.max(1, assignedSeats)}
                  >
                    <span className="text-lg">-</span>
                  </Button>
                  <NumberFlow
                    value={displaySeatCount}
                    className="text-lg min-w-[40px] text-center"
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={handleIncrement}
                    disabled={displaySeatCount >= 100}
                  >
                    <span className="text-lg">+</span>
                  </Button>
                  <span className="text-foreground ml-4">{assignedSeats} assigned</span>
                </div>
              </SubscriptionInfoItem>

              <SeatChangePreview
                hasChanges={hasChanges}
                willReactivate={willReactivate}
                isLoadingPreview={isLoadingPreview}
                preview={preview ?? null}
                displaySeatCount={displaySeatCount}
                pricePerSeat={pricePerSeat}
              />

              {subscription.expiresAt && (
                <>
                  <Separator className="my-4" />
                  <SubscriptionInfoItem
                    label={subscription.cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                    separator={false}
                  >
                    {formatDate(subscription.expiresAt)}
                  </SubscriptionInfoItem>
                </>
              )}
            </>
          ) : (
            <SubscriptionInfoItem label="Status" separator={false}>
              <span className="text-muted-foreground">No active subscription</span>
            </SubscriptionInfoItem>
          )}
        </SubscriptionInfoList>

        {subscription?.status === "ACTIVE" && (
          <>
            {quotaPool && !quotaPool.hasUnlimited && quotaPool.total !== -1 && (
              <QuotaProgress used={quotaPool.used} total={quotaPool.total} />
            )}
            <div className="flex gap-2 mt-6">
              {subscription.cancelAtPeriodEnd ? (
                <LoadingButton
                  isLoading={isReactivating}
                  loadingText="Reactivating..."
                  onClick={onReactivateSubscription}
                >
                  Reactivate
                </LoadingButton>
              ) : (
                <>
                  <Button
                    onClick={() => setShowUpdateDialog(true)}
                    disabled={!hasChanges || isUpdatingSeats}
                  >
                    {isUpdatingSeats && <Loader2 className="size-3 animate-spin" />}
                    {willReactivate ? "Update & Reactivate" : "Update Seats"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
                    Cancel subscription
                  </Button>
                  <AlertDialog
                    open={showCancelDialog}
                    onOpenChange={(open) => !isCancelPending && setShowCancelDialog(open)}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          All members will lose access at the end of the current billing period. You
                          can reactivate anytime before then.
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
                </>
              )}
            </div>
          </>
        )}

        {subscription?.status !== "ACTIVE" && !isLoading && (
          <PlanSelector onManageSubscription={onManageSubscription} isManaging={isManaging} />
        )}

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
                {isUpdatingSeats && <Loader2 className="size-4 animate-spin" />}
                {willReactivate ? "Confirm & Reactivate" : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
