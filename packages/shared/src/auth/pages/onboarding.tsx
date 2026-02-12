import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Checkbox } from "components/components/ui/checkbox";
import { Label } from "components/components/ui/label";
import { LoadingButton } from "components/components/ui/loading-button";
import { useCallback, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useNavigationConfig } from "../../navigation";
import { useApi } from "../../services";
import { useAuth } from "../hooks/use-auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** Onboarding page where new users choose between solo developer and team account types. */
export function OnboardingPage() {
  const { user, isLoading, setUser } = useAuth();
  const api = useApi();
  const navigate = useNavigate();
  const { afterAuthUrl } = useNavigationConfig();
  const queryClient = useQueryClient();
  const [accountType, setAccountType] = useState<"solo" | "team" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct fetch instead of useMutation to minimize re-renders
  const createOrg = useCallback(
    async ({ name, isPersonal }: { name: string; isPersonal?: boolean }) => {
      const response = await fetch(`${API_URL}/api/organizations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, isPersonal }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create organization");
      }

      const data = await response.json();
      // Invalidate organizations query so it refetches when user lands on console
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      return data;
    },
    [user?.access_token, queryClient]
  );

  if (isLoading || isSubmitting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if already completed onboarding (from database via user object)
  if (user.onboardingCompletedAt) {
    return <Navigate to={afterAuthUrl} replace />;
  }

  const completeOnboarding = async (accountType: "SOLO" | "TEAM", personalOrgId?: string) => {
    const response = await api.post("/api/onboarding/complete", { accountType, personalOrgId });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to complete onboarding");
    }
    const data = await response.json();
    // Update user in auth context
    setUser({
      ...user,
      accountType: data.accountType,
      onboardingCompletedAt: data.onboardingCompletedAt,
      personalOrgId: data.personalOrgId,
    });
  };

  const handleContinue = async () => {
    if (!accountType) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (accountType === "solo") {
        const orgName = user.name || user.login || "Personal";
        const newOrg = await createOrg({ name: orgName, isPersonal: true });
        await completeOnboarding("SOLO", newOrg.id);
        navigate(afterAuthUrl);
      } else {
        await completeOnboarding("TEAM");
        navigate("/create-organization");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Do you need an organization?</CardTitle>
          <CardDescription>
            Organizations allow you to manage multiple users in the same team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="solo"
              checked={accountType === "solo"}
              onCheckedChange={(checked) => setAccountType(checked ? "solo" : null)}
              disabled={isSubmitting}
              className="mt-[3px]"
            />
            <div className="space-y-1">
              <Label htmlFor="solo" className="text-base cursor-pointer">
                Solo Developer
              </Label>
              <p className="text-sm text-muted-foreground">Personal projects or individual use.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="team"
              checked={accountType === "team"}
              onCheckedChange={(checked) => setAccountType(checked ? "team" : null)}
              disabled={isSubmitting}
              className="mt-[3px]"
            />
            <div className="space-y-1">
              <Label htmlFor="team" className="text-base cursor-pointer">
                Team
              </Label>
              <p className="text-sm text-muted-foreground">
                Organization with multiple developers.
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <LoadingButton
            onClick={handleContinue}
            disabled={!accountType}
            isLoading={isSubmitting}
            loadingText="Setting up..."
          >
            Continue
          </LoadingButton>
        </CardContent>
      </Card>
    </div>
  );
}

export default OnboardingPage;
