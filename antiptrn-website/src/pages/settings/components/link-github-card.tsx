import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useLinkGitHub } from "@/hooks/use-api";

interface LinkGitHubCardProps {
  token?: string;
  onLinked?: () => void;
}

/**
 * Card component for linking GitHub account (for Google users)
 */
export function LinkGitHubCard({ token, onLinked }: LinkGitHubCardProps) {
  const linkGitHub = useLinkGitHub(token);
  const [searchParams, setSearchParams] = useSearchParams();
  const githubLinked = searchParams.get("github_linked") === "true";
  const error = searchParams.get("error");

  // Clear URL params and notify parent when GitHub was just linked
  useEffect(() => {
    if (githubLinked) {
      onLinked?.();
      // Clear the URL param after a delay so user sees the success message
      const timer = setTimeout(() => {
        setSearchParams((params) => {
          params.delete("github_linked");
          return params;
        });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [githubLinked, onLinked, setSearchParams]);

  const handleLinkGitHub = async () => {
    try {
      const { url } = await linkGitHub.mutateAsync();
      window.location.href = url;
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link GitHub Account</CardTitle>
        <CardDescription>
          Link your GitHub account to access your repositories and enable code reviews.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {githubLinked && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600 dark:bg-green-400/10 dark:text-green-400">
            GitHub account linked successfully! You can now access your repositories.
          </div>
        )}

        {error === "github_link_failed" && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Failed to link GitHub account. Please try again.
          </div>
        )}

        {error === "github_already_linked" && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            This GitHub account is already linked to another user.
          </div>
        )}

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
