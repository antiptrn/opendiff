import type { useAuth } from "shared/auth";
import { useBilling, useCancelSubscription, useResubscribe } from "shared/billing";
import {
  useCancelOrgSubscription,
  useManageSubscription,
  useOrganization,
  useOrganizationMembers,
  useReactivateSubscription,
} from "shared/organizations";
import { toast } from "sonner";
import { SoloSubscriptionCard, TeamSubscriptionCard } from "./billing";
import { BillingHistoryCard } from "./billing-history-card";

interface BillingTabProps {
  user: ReturnType<typeof useAuth>["user"];
  orgId?: string | null;
  isSoloUser?: boolean;
}

/**
 * Billing tab - shows subscription details, seat management (for teams), and billing history
 */
export function BillingTab({ user, orgId, isSoloUser }: BillingTabProps) {
  const { currentSeat, hasSeat, subscription, orgDetails, quotaPool, isLoadingDetails } =
    useOrganization();

  useBilling(user?.access_token, orgId);
  const cancelSubscription = useCancelSubscription(user?.access_token, orgId);
  const resubscribe = useResubscribe(user?.access_token, orgId);

  // Team billing hooks
  const { data: membersData } = useOrganizationMembers(orgId ?? null);
  const teamQuotaPool = membersData?.quotaPool || orgDetails?.quotaPool;
  const manageSubscriptionMutation = useManageSubscription(orgId ?? null);
  const cancelOrgSubscriptionMutation = useCancelOrgSubscription(orgId ?? null);
  const reactivateSubscriptionMutation = useReactivateSubscription(orgId ?? null);

  const hasSubscription = !!(hasSeat && currentSeat?.tier);
  const assignedSeats = membersData?.members?.filter((m) => m.hasSeat).length ?? 0;

  // Solo user handlers
  const handleCancelSoloSubscription = async () => {
    try {
      await cancelSubscription.mutateAsync();
      toast.success("Subscription cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel subscription");
    }
  };

  const handleReactivateSolo = async () => {
    try {
      await resubscribe.mutateAsync();
      toast.success("Subscription reactivated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reactivate subscription");
    }
  };

  // Team subscription handlers
  const handleManageSubscription = async (
    tier: "SELF_SUFFICIENT" | "PRO" | "ULTRA",
    billing: "monthly" | "yearly",
    seatCount: number
  ) => {
    try {
      const result = await manageSubscriptionMutation.mutateAsync({ tier, billing, seatCount });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to manage subscription");
    }
  };

  const handleCancelOrgSubscription = async () => {
    try {
      await cancelOrgSubscriptionMutation.mutateAsync();
      toast.success("Subscription cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel subscription");
    }
  };

  const handleReactivateOrgSubscription = async () => {
    try {
      await reactivateSubscriptionMutation.mutateAsync();
      toast.success("Subscription reactivated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reactivate subscription");
    }
  };

  // Render team billing for non-solo users
  if (!isSoloUser) {
    return (
      <div className="space-y-6">
        <TeamSubscriptionCard
          subscription={subscription}
          isLoading={isLoadingDetails}
          assignedSeats={assignedSeats}
          quotaPool={teamQuotaPool}
          orgId={orgId ?? null}
          onManageSubscription={handleManageSubscription}
          onCancelSubscription={handleCancelOrgSubscription}
          onReactivateSubscription={handleReactivateOrgSubscription}
          isReactivating={reactivateSubscriptionMutation.isPending}
          isCancelPending={cancelOrgSubscriptionMutation.isPending}
          isManaging={manageSubscriptionMutation.isPending}
        />

        <BillingHistoryCard user={user} orgId={orgId} isSoloUser={isSoloUser} />
      </div>
    );
  }

  // Solo user billing
  return (
    <div className="space-y-6">
      <SoloSubscriptionCard
        seat={
          currentSeat
            ? {
                tier: currentSeat.tier,
                status: currentSeat.status,
                expiresAt: currentSeat.expiresAt,
                cancelAtPeriodEnd: currentSeat.cancelAtPeriodEnd ?? false,
              }
            : null
        }
        hasSubscription={hasSubscription}
        isLoading={isLoadingDetails}
        quotaPool={quotaPool}
        onCancelSubscription={handleCancelSoloSubscription}
        onReactivate={handleReactivateSolo}
        isReactivating={resubscribe.isPending}
        isCancelling={cancelSubscription.isPending}
      />

      <BillingHistoryCard user={user} orgId={orgId} isSoloUser={isSoloUser} />
    </div>
  );
}
