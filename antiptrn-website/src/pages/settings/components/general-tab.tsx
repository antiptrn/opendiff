import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import type { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { ApiKeyCard } from "./api-key-card";
import { CustomReviewRulesCard } from "./custom-review-rules-card";
import { AccountManagementCard } from "./account-management-card";
import { LinkGitHubCard } from "./link-github-card";

interface GeneralTabProps {
  user: ReturnType<typeof useAuth>["user"];
  logout: () => void;
  orgId?: string | null;
  setUser: ReturnType<typeof useAuth>["setUser"];
}

/**
 * General settings tab - GitHub app, API key, review rules, account management
 */
export function GeneralTab({ user, logout, orgId, setUser }: GeneralTabProps) {
  const { currentSeat, hasSeat } = useOrganization();
  const tier = hasSeat ? currentSeat?.tier : null;

  // Show GitHub link card for Google users who haven't linked GitHub
  const needsGithubLink = user?.auth_provider === "google" && !user?.hasGithubLinked;

  const handleGithubLinked = () => {
    if (user) {
      setUser({ ...user, hasGithubLinked: true });
    }
  };

  return (
    <div className="space-y-6">
      {/* Link GitHub - for Google users without GitHub linked */}
      {needsGithubLink && (
        <LinkGitHubCard token={user?.access_token} onLinked={handleGithubLinked} />
      )}

      {/* Install GitHub App */}
      <Card>
        <CardHeader>
          <CardTitle>Install GitHub App</CardTitle>
          <CardDescription>
            Install the GitHub App on your repositories to enable code reviews. You can install it
            on your personal account or any organization you have access to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a
              href="https://github.com/apps/antiptrn-review-agent/installations/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              Install GitHub App
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* BYOK API Key Card */}
      {tier === "BYOK" && <ApiKeyCard token={user?.access_token} orgId={orgId} />}

      {/* Custom Review Rules - available for all paid plans */}
      {tier && <CustomReviewRulesCard token={user?.access_token} orgId={orgId} />}

      {/* Account Management */}
      <AccountManagementCard token={user?.access_token} orgId={orgId} logout={logout} />
    </div>
  );
}
