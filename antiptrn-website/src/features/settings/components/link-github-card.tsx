import { Button } from "@shared/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@shared/components/ui/card";
import { Loader2 } from "lucide-react";
import { useLinkGitHub, useUnlinkGitHub } from "@features/settings";

interface LinkGitHubCardProps {
  token?: string;
  isLinked?: boolean;
  onUnlinked?: () => void;
  onLogout?: () => void;
}

/**
 * Card component for linking/unlinking GitHub account (for Google users)
 */
export function LinkGitHubCard({ token, isLinked, onUnlinked, onLogout }: LinkGitHubCardProps) {
  const linkGitHub = useLinkGitHub(token);
  const unlinkGitHub = useUnlinkGitHub(token);

  const handleLinkGitHub = async () => {
    try {
      const { url } = await linkGitHub.mutateAsync();
      window.location.href = url;
    } catch {
      // Error handled by mutation
    }
  };

  const handleUnlinkGitHub = async () => {
    try {
      await unlinkGitHub.mutateAsync();
      onUnlinked?.();
      // Log out so user can re-authenticate with Google (their current token is now invalid)
      onLogout?.();
    } catch {
      // Error handled by mutation
    }
  };

  if (isLinked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GitHub Account</CardTitle>
          <CardDescription>
            Your GitHub account is linked. Unlinking will sign you out so you can re-authenticate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {unlinkGitHub.error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {unlinkGitHub.error?.message}
            </div>
          )}

          <Button variant="outline" onClick={handleUnlinkGitHub} disabled={unlinkGitHub.isPending}>
            {unlinkGitHub.isPending && <Loader2 className="size-4 animate-spin" />}
            Unlink GitHub Account
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub Account</CardTitle>
        <CardDescription>
          Link your GitHub account to access your repositories and enable code reviews.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {linkGitHub.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {linkGitHub.error?.message}
          </div>
        )}

        <Button onClick={handleLinkGitHub} disabled={linkGitHub.isPending}>
          {linkGitHub.isPending && <Loader2 className="size-4 animate-spin" />}
          Link GitHub Account
        </Button>
      </CardContent>
    </Card>
  );
}
