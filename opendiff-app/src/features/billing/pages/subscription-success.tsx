import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { Button } from "opendiff-components/components/ui/button";
import { useAuth } from "opendiff-shared/auth";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL = 1000;

export function SubscriptionSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, setUser } = useAuth();
  const [status, setStatus] = useState<"polling" | "success" | "timeout">("polling");
  const [attempts, setAttempts] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkoutId = searchParams.get("checkout_id");

  useEffect(() => {
    if (!user?.access_token) {
      // Not logged in, redirect to login
      navigate("/login");
      return;
    }

    const pollSubscriptionStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/subscription/status`, {
          headers: {
            Authorization: `Bearer ${user.access_token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch subscription status");
        }

        const data = await response.json();

        if (data.subscriptionStatus === "ACTIVE" && data.polarSubscriptionId) {
          // Subscription is active!
          setStatus("success");

          // Update user in local state
          setUser({
            ...user,
            subscriptionTier: data.subscriptionTier,
            subscriptionStatus: data.subscriptionStatus,
          });

          // Clear polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }

          // Redirect to console after a moment
          setTimeout(() => {
            navigate("/console");
          }, 2000);

          return;
        }

        // Still waiting
        setAttempts((prev) => {
          const newAttempts = prev + 1;
          if (newAttempts >= MAX_POLL_ATTEMPTS) {
            setStatus("timeout");
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
            }
          }
          return newAttempts;
        });
      } catch (error) {
        console.error("Error polling subscription status:", error);
      }
    };

    // Start polling
    pollSubscriptionStatus();
    pollingRef.current = setInterval(pollSubscriptionStatus, POLL_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [user, navigate, setUser]);

  const handleRetry = () => {
    setStatus("polling");
    setAttempts(0);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md w-full mx-auto px-4">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          {status === "polling" && (
            <>
              <Loader2 className="size-12 animate-spin text-primary mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">Processing your subscription</h1>
              <p className="text-muted-foreground mb-4">
                Please wait while we confirm your payment...
              </p>
              <div className="text-sm text-muted-foreground">
                Attempt {attempts} of {MAX_POLL_ATTEMPTS}
              </div>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle className="size-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">Subscription activated!</h1>
              <p className="text-muted-foreground mb-4">
                Thank you for subscribing. Redirecting you to the console...
              </p>
            </>
          )}

          {status === "timeout" && (
            <>
              <XCircle className="size-12 text-amber-600 dark:text-amber-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">Taking longer than expected</h1>
              <p className="text-muted-foreground mb-4">
                Your payment may still be processing. You can try refreshing or check back later.
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={handleRetry}>
                  Try again
                </Button>
                <Button onClick={() => navigate("/console")}>Go to console</Button>
              </div>
            </>
          )}

          {checkoutId && (
            <p className="text-xs text-muted-foreground mt-6">Checkout ID: {checkoutId}</p>
          )}
        </div>
      </div>
    </div>
  );
}
