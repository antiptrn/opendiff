import { Button } from "components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { ExternalLink } from "lucide-react";
import type { useAuth } from "shared/auth";
import { CustomReviewRulesCard } from "./custom-review-rules-card";

interface CodeReviewTabProps {
  user: ReturnType<typeof useAuth>["user"];
  orgId?: string | null;
}

/**
 * Code Review settings tab - GitHub app, custom review rules
 */
export function CodeReviewTab({ user, orgId }: CodeReviewTabProps) {
  // User has GitHub access if signed in with GitHub or linked their GitHub account
  const hasGithubAccess = user?.auth_provider === "github" || user?.hasGithubLinked;

  return (
    <div className="space-y-6">
      {/* Install GitHub App - only show if user has GitHub access */}
      {hasGithubAccess && (
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
                href="https://github.com/apps/opendiff-agent/installations/new"
                target="_blank"
                rel="noopener noreferrer"
              >
                Install GitHub App
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <CustomReviewRulesCard token={user?.access_token} orgId={orgId} />
    </div>
  );
}
