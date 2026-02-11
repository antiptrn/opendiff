import { Loader2 } from "lucide-react";
import { useAuth } from "shared/auth";
import { useManageSubscription, useOrganization } from "shared/organizations";
import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const navigate = useNavigate();
  const hasStarted = useRef(false);

  const tier = searchParams.get("tier") as "SELF_SUFFICIENT" | "PRO" | "ULTRA" | null;
  const billing = (searchParams.get("billing") as "monthly" | "yearly") || "yearly";

  const orgId = currentOrgId || user?.organizations?.[0]?.id || null;
  const manageSubscription = useManageSubscription(orgId);

  useEffect(() => {
    if (!tier) {
      navigate("/console");
      return;
    }

    if (!user) {
      const redirectUrl = `/checkout?tier=${tier}&billing=${billing}`;
      navigate(`/login?redirectUrl=${encodeURIComponent(redirectUrl)}`, { replace: true });
      return;
    }

    if (!orgId || hasStarted.current) return;
    hasStarted.current = true;

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
        navigate("/pricing");
      });
  }, [user, orgId, tier, billing, navigate, manageSubscription]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Preparing checkout...</p>
      </div>
    </div>
  );
}
