import { AvatarUpload } from "components/components/ui/avatar-upload";
import { Button } from "components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Input } from "components/components/ui/input";
import { Label } from "components/components/ui/label";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useOrganization } from "..";
import { useAuth } from "../../auth";
import { useNavigationConfig } from "../../navigation";
import { useApi } from "../../services";

/** Page for creating a new organization with a name and optional avatar. */
export default function CreateOrganizationPage() {
  const navigate = useNavigate();
  const { afterAuthUrl } = useNavigationConfig();
  const { user, isLoading: isAuthLoading, logout } = useAuth();
  const { createOrg, isCreating, hasOrganizations, isLoadingOrgs, isUnauthorized } =
    useOrganization();
  const api = useApi();

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Show loading while checking auth
  if (isAuthLoading) {
    return (
      <section className="w-screen h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If token is expired/invalid, log out and redirect to login
  if (isUnauthorized) {
    logout();
    return <Navigate to="/login" replace />;
  }

  // Redirect to onboarding if not completed
  if (!user.onboardingCompletedAt) {
    return <Navigate to="/onboarding" replace />;
  }

  // Wait for orgs to load
  if (isLoadingOrgs) {
    return (
      <section className="w-screen h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // If user already has an org, or is a solo user, redirect to console
  if (hasOrganizations || user.accountType === "SOLO") {
    return <Navigate to={afterAuthUrl} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }

    try {
      const newOrg = await createOrg({ name: name.trim() });

      // Upload avatar if selected
      if (avatarFile) {
        const formData = new FormData();
        formData.append("file", avatarFile);
        await api.upload(`/api/organizations/${newOrg.id}/avatar`, formData);
      }

      // Navigate to console
      navigate(afterAuthUrl, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    }
  };

  return (
    <section className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create your organization</CardTitle>
          <CardDescription>Manage your team and billing in one place.</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Avatar upload */}
            <AvatarUpload
              fallback={name.trim() ? name.charAt(0).toUpperCase() : "?"}
              alt="Organization logo"
              size="lg"
              disabled={isCreating}
              onUpload={(file) => setAvatarFile(file)}
              onRemove={() => setAvatarFile(null)}
              showRemove={!!avatarFile}
              helperText="Click to upload logo"
              className="items-center"
            />

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                className="bg-background"
                placeholder="Acme Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isCreating}
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={isCreating || !name.trim()}>
              {isCreating && <Loader2 className="size-4 animate-spin" />}
              {isCreating ? "Creating..." : "Create organization"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </section>
  );
}
