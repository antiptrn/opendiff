import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import {
  useUpdateSeatCount,
  usePreviewSeatChange,
  useReactivateSubscription,
  type OrgSubscription,
} from "@/hooks/use-organization";
import { formatCents, tierPrices } from "../utils";

interface SeatManagementCardProps {
  orgId: string | null;
  subscription: OrgSubscription | null;
  seats: { total: number; assigned: number; available: number } | null;
}

/**
 * Props for the seat management form
 */
interface SeatFormProps {
  orgId: string | null;
  currentSeatCount: number;
  assignedSeats: number;
  isCancelling: boolean;
  pricePerSeat: number;
}

/**
 * Form component for managing seat count
 * Uses key prop pattern - parent resets via key when currentSeatCount changes
 */
function SeatForm({
  orgId,
  currentSeatCount,
  assignedSeats,
  isCancelling,
  pricePerSeat,
}: SeatFormProps) {
  const [pendingSeatCount, setPendingSeatCount] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Use pendingSeatCount for preview, but only if it differs from current
  const previewCount =
    pendingSeatCount !== null && pendingSeatCount !== currentSeatCount ? pendingSeatCount : null;

  const { data: preview, isLoading: isLoadingPreview } = usePreviewSeatChange(orgId, previewCount);
  const updateSeatCountMutation = useUpdateSeatCount(orgId);
  const reactivateSubscriptionMutation = useReactivateSubscription(orgId);

  const displaySeatCount = pendingSeatCount ?? currentSeatCount;
  const hasChanges = pendingSeatCount !== null && pendingSeatCount !== currentSeatCount;
  const isAddingSeats =
    hasChanges && pendingSeatCount !== null && pendingSeatCount > currentSeatCount;
  const willReactivate = isCancelling && isAddingSeats;

  const handleIncrement = () => {
    const newCount = Math.min(100, displaySeatCount + 1);
    setPendingSeatCount(newCount);
  };

  const handleDecrement = () => {
    // Can't go below assigned seats or 1
    const minSeats = Math.max(1, assignedSeats);
    const newCount = Math.max(minSeats, displaySeatCount - 1);
    setPendingSeatCount(newCount);
  };

  const handleConfirmUpdate = async () => {
    if (pendingSeatCount === null) return;

    try {
      // If adding seats to a cancelling subscription, reactivate it first
      if (willReactivate) {
        await reactivateSubscriptionMutation.mutateAsync();
      }
      await updateSeatCountMutation.mutateAsync(pendingSeatCount);
      setShowConfirmDialog(false);
      // Don't reset pendingSeatCount here - let the key prop do it when
      // currentSeatCount updates from the refetch to avoid flashing old value
    } catch {
      // Error handled by mutation
    }
  };

  const isPending = updateSeatCountMutation.isPending || reactivateSubscriptionMutation.isPending;
  const monthlyTotal = displaySeatCount * pricePerSeat;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Current: {currentSeatCount} {currentSeatCount === 1 ? "seat" : "seats"} ($
            {currentSeatCount * pricePerSeat}/month)
          </p>
          <p className="text-sm text-muted-foreground">
            Assigned: {assignedSeats}/{currentSeatCount}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handleDecrement}
          disabled={displaySeatCount <= Math.max(1, assignedSeats)}
        >
          <span className="text-lg font-semibold">-</span>
        </Button>

        <div className="flex flex-col items-center min-w-[60px]">
          <span className="text-2xl">{displaySeatCount}</span>
          <span className="text-xs text-muted-foreground">seats</span>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={handleIncrement}
          disabled={displaySeatCount >= 100}
        >
          <span className="text-lg font-semibold">+</span>
        </Button>

        {hasChanges && (
          <Button size="sm" onClick={() => setShowConfirmDialog(true)} disabled={isPending}>
            {isPending && <Loader2 className="size-3 animate-spin" />}
            {willReactivate ? "Update & Reactivate" : "Update Seats"}
          </Button>
        )}
      </div>

      {hasChanges && (
        <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
          {willReactivate && (
            <p className="text-sm text-green-600 font-medium">
              This will reactivate your subscription
            </p>
          )}
          {isLoadingPreview ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Calculating proration...</span>
            </div>
          ) : preview ? (
            <>
              <div className="space-y-1">
                <p className="text-sm">Charge today:</p>
                {preview.proratedCharge !== 0 ? (
                  <p className="text-base">
                    {preview.proratedCharge > 0 ? (
                      <span className="">{formatCents(preview.proratedCharge)}</span>
                    ) : (
                      <span className="text-green-600">{formatCents(preview.proratedCharge)}</span>
                    )}
                    <span className="text-sm text-muted-foreground ml-1">
                      {preview.proratedCharge > 0
                        ? "(prorated)"
                        : "(credit applied to next invoice)"}
                    </span>
                  </p>
                ) : (
                  <p className="text-base font-semibold text-muted-foreground">$0.00</p>
                )}
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  Next billing amount:{" "}
                  <span className="font-medium">{formatCents(preview.nextBillingAmount)}</span>
                  /month
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">New total: ${monthlyTotal}/month</p>
          )}
        </div>
      )}

      {(updateSeatCountMutation.error || reactivateSubscriptionMutation.error) && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {updateSeatCountMutation.error?.message || reactivateSubscriptionMutation.error?.message}
        </div>
      )}

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
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
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {willReactivate ? "Confirm & Reactivate" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Card component for managing subscription seats
 */
export function SeatManagementCard({ orgId, subscription, seats }: SeatManagementCardProps) {
  if (!subscription || subscription.status !== "ACTIVE") {
    return null;
  }

  const currentSeatCount = subscription.seatCount ?? 0;
  const assignedSeats = seats?.assigned ?? 0;
  const isCancelling = subscription.cancelAtPeriodEnd ?? false;
  const pricePerSeat = tierPrices[subscription.tier] ?? 19;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Seats</CardTitle>
        <CardDescription>Add or remove seats from your subscription</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key resets form when seat count changes from server */}
        <SeatForm
          key={currentSeatCount}
          orgId={orgId}
          currentSeatCount={currentSeatCount}
          assignedSeats={assignedSeats}
          isCancelling={isCancelling}
          pricePerSeat={pricePerSeat}
        />
      </CardContent>
    </Card>
  );
}
