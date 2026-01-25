import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/components/ui/card";
import { useAuth } from "@features/auth";
import { useOrganization, useManageSubscription } from "@modules/organizations";
import { Loader2, UserX, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const tierPrices: Record<string, number> = {
  BYOK: 9,
  CODE_REVIEW: 19,
  TRIAGE: 49,
};

export function NoSeatPage() {
  const { user } = useAuth();
  const { currentOrg, subscription, seats, canManageBilling } = useOrganization();
  const manageSubscriptionMutation = useManageSubscription(currentOrg?.id || null);
  const [error, setError] = useState<string | null>(null);
  const [seatCount, setSeatCount] = useState(1);

  const isSoloUser = user?.accountType === "SOLO";
  const hasActiveSubscription = subscription?.status === "ACTIVE";
  const hasAvailableSeats = (seats?.available ?? 0) > 0;

  const handleSubscribe = async (tier: "BYOK" | "CODE_REVIEW" | "TRIAGE") => {
    setError(null);
    try {
      const result = await manageSubscriptionMutation.mutateAsync({
        tier,
        billing: "monthly",
        seatCount: isSoloUser ? 1 : seatCount,
      });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create checkout");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 rounded-full bg-muted p-3 w-fit">
            <UserX className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">No Active Subscription</CardTitle>
          <CardDescription>
            {isSoloUser
              ? "Subscribe to start using antiptrn."
              : "You need a seat assigned to access this organization's features."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive text-center">
              {error}
            </div>
          )}

          {hasActiveSubscription && !isSoloUser ? (
            // Org has subscription - user needs seat assignment (team mode only)
            <div className="text-center space-y-4">
              {hasAvailableSeats ? (
                <p className="text-muted-foreground">
                  Your organization has {seats?.available} available seat
                  {seats?.available !== 1 ? "s" : ""}. Contact your organization admin to get a seat
                  assigned.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Your organization has no available seats. Contact your organization admin to add
                  more seats or reassign an existing one.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Organization: <span className="font-medium">{currentOrg?.name}</span>
              </p>
              {canManageBilling && (
                <Button asChild variant="outline">
                  <Link to="/console/settings/organization">Manage Seats</Link>
                </Button>
              )}
            </div>
          ) : canManageBilling ? (
            // No subscription and user can manage billing - show subscribe options
            <div className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                {isSoloUser
                  ? "Choose a plan to get started:"
                  : "Your organization doesn't have an active subscription. Choose a plan to get started:"}
              </p>

              {/* Seat count selector - only show for team users */}
              {!isSoloUser && (
                <div className="flex items-center justify-center gap-4 py-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSeatCount(Math.max(1, seatCount - 1))}
                    disabled={seatCount <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-2xl font-semibold">{seatCount}</span>
                    <span className="text-xs text-muted-foreground">
                      {seatCount === 1 ? "seat" : "seats"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSeatCount(Math.min(100, seatCount + 1))}
                    disabled={seatCount >= 100}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => handleSubscribe("BYOK")}
                  disabled={manageSubscriptionMutation.isPending}
                >
                  <span>BYOK - Bring your own API key</span>
                  <span className="text-muted-foreground">
                    ${tierPrices.BYOK * (isSoloUser ? 1 : seatCount)}/month
                  </span>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => handleSubscribe("CODE_REVIEW")}
                  disabled={manageSubscriptionMutation.isPending}
                >
                  <span>Review - 100 reviews/month</span>
                  <span className="text-muted-foreground">
                    ${tierPrices.CODE_REVIEW * (isSoloUser ? 1 : seatCount)}/month
                  </span>
                </Button>

                <Button
                  className="w-full justify-between"
                  onClick={() => handleSubscribe("TRIAGE")}
                  disabled={manageSubscriptionMutation.isPending}
                >
                  {manageSubscriptionMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  <span>Triage - 250 reviews + triage mode</span>
                  <span className="text-muted-foreground">
                    ${tierPrices.TRIAGE * (isSoloUser ? 1 : seatCount)}/month
                  </span>
                </Button>
              </div>
            </div>
          ) : (
            // No subscription and user can't manage billing
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                Your organization doesn't have an active subscription. Contact your organization
                admin to set one up.
              </p>
              <p className="text-sm text-muted-foreground">
                Organization: <span className="font-medium">{currentOrg?.name}</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
