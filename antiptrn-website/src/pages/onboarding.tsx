import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useApi } from "@/hooks/use-api";
import { Navigate, useNavigate } from "react-router-dom";
import { Users, User, Loader2 } from "lucide-react";
import { useState } from "react";

export function OnboardingPage() {
  const { user, isLoading, setUser } = useAuth();
  const { createOrg } = useOrganization();
  const api = useApi();
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState<"solo" | "team" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
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
    return <Navigate to="/console" replace />;
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

  const handleSolo = async () => {
    setIsCreating("solo");
    setError(null);
    try {
      // Create a personal organization using the user's name or login
      const orgName = user.name || user.login || "Personal";
      const newOrg = await createOrg({ name: orgName, isPersonal: true });
      // Pass the org ID so it can be stored as the user's personal org
      await completeOnboarding("SOLO", newOrg.id);
      navigate("/console");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
      setIsCreating(null);
    }
  };

  const handleTeam = async () => {
    setIsCreating("team");
    setError(null);
    try {
      await completeOnboarding("TEAM");
      navigate("/create-organization");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete onboarding");
      setIsCreating(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to antiptrn</CardTitle>
          <CardDescription>
            How will you be using antiptrn?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full h-auto py-6 flex flex-col items-center gap-2"
            onClick={handleSolo}
            disabled={!!isCreating}
          >
            {isCreating === "solo" ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <User className="h-8 w-8" />
            )}
            <div className="text-center">
              <p className="font-semibold">Solo Developer</p>
              <p className="text-sm text-muted-foreground font-normal">
                I'm working on personal projects or as an individual
              </p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full h-auto py-6 flex flex-col items-center gap-2"
            onClick={handleTeam}
            disabled={!!isCreating}
          >
            {isCreating === "team" ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <Users className="h-8 w-8" />
            )}
            <div className="text-center">
              <p className="font-semibold">Team</p>
              <p className="text-sm text-muted-foreground font-normal">
                I'm part of a team or organization with multiple developers
              </p>
            </div>
          </Button>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default OnboardingPage;
