import { Button } from "components/components/ui/button";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "shared/auth";
import { useManageSubscription, useOrganization } from "shared/organizations";

export function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentOrgId, currentOrg, isLoadingOrgs, hasFetchedOrgs } = useOrganization();
  const navigate = useNavigate();
  const hasStarted = useRef(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tier = searchParams.get("tier") as "SELF_SUFFICIENT" | "PRO" | "ULTRA" | null;
  const billing = (searchParams.get("billing") as "monthly" | "yearly") || "yearly";

  // Optional override for deep links / debugging
  const requestedOrgId = searchParams.get("orgId");

  const orgId = useMemo(() => {
    const orgs = user?.organizations ?? [];
    if (!orgs.length) {
      if (currentOrgId && currentOrg?.role === "OWNER") {
        return currentOrgId;
      }
      return null;
    }

    const isOwner = (id: string | null | undefined) =>
      !!id && orgs.some((o) => o.id === id && o.role === "OWNER");

    // Prefer explicitly requested org (if the user can manage billing)
    if (requestedOrgId && isOwner(requestedOrgId)) return requestedOrgId;

    // Prefer the currently selected org (if the user can manage billing there)
    if (isOwner(currentOrgId)) return currentOrgId;

    // Fall back to any org the user owns (including personal org)
    const firstOwned = orgs.find((o) => o.role === "OWNER");
    return firstOwned?.id ?? null;
  }, [user?.organizations, currentOrgId, currentOrg?.role, requestedOrgId]);

  const manageSubscription = useManageSubscription(orgId);

  useEffect(() => {
    if (!tier) {
      navigate("/console");
      return;
    }

    if (!user) {
      const orgQuery = requestedOrgId ? `&orgId=${encodeURIComponent(requestedOrgId)}` : "";
      const redirectUrl = `/checkout?tier=${tier}&billing=${billing}${orgQuery}`;
      navigate(`/login?redirectUrl=${encodeURIComponent(redirectUrl)}`, { replace: true });
      return;
    }

    // Wait for org resolution before showing a hard error.
    if (isLoadingOrgs || !hasFetchedOrgs) {
      return;
    }

    // We can only create checkout for an org where the current user is an OWNER.
    if (!orgId) {
      setErrorMessage(
        "You don't have an organization you can manage billing for. Switch to an org you own, or ask an org owner to purchase seats."
      );
      return;
    }

    if (hasStarted.current) return;
    hasStarted.current = true;

    // Reset any prior error on retry / re-entry
    setErrorMessage(null);

    manageSubscription
      .mutateAsync({ tier, billing, seatCount: 1 })
      .then((result) => {
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
        } else {
          navigate("/console");
        }
      })
      .catch((error) => {
        console.error("Failed to create checkout:", error);
        setErrorMessage(error instanceof Error ? error.message : "Failed to create checkout");
      });
  }, [
    user,
    orgId,
    tier,
    billing,
    requestedOrgId,
    navigate,
    manageSubscription,
    isLoadingOrgs,
    hasFetchedOrgs,
  ]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      {errorMessage ? (
        <div className="w-full max-w-md mx-auto px-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <h1 className="text-lg font-semibold">Checkout couldn't be created</h1>
            <p className="text-sm text-muted-foreground mt-2">{errorMessage}</p>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => navigate("/console/settings/organization")}
                variant="outline"
                className="flex-1"
              >
                Organization settings
              </Button>
              <Button onClick={() => navigate("/console")} className="flex-1">
                Go to console
              </Button>
            </div>

            <div className="mt-4">
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  hasStarted.current = false;
                  setErrorMessage(null);
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Preparing checkout...</p>
        </div>
      )}
    </div>
  );
}
