import { ExternalLink } from "lucide-react";
import { Button } from "opendiff-components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "opendiff-components/components/ui/card";
import { Skeleton } from "opendiff-components/components/ui/skeleton";
import type { useAuth } from "opendiff-shared/auth";
import { useOrganization } from "opendiff-shared/organizations";
import { CustomReviewRulesCard } from "./custom-review-rules-card";

interface CodeReviewTabProps {
  user: ReturnType<typeof useAuth>["user"];
  orgId?: string | null;
}

/**
 * Code Review settings tab - GitHub app, custom review rules
 */
export function CodeReviewTab({ user, orgId }: CodeReviewTabProps) {
  const { currentSeat, hasSeat, isLoadingDetails } = useOrganization();
  const tier = hasSeat ? currentSeat?.tier : null;

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
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Custom Review Rules - available for all paid plans */}
      {isLoadingDetails ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom Review Rules</CardTitle>
            <CardDescription>
              Define custom rules and guidelines for the AI to follow when reviewing your code.
              These rules will be included in every review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Skeleton muted className="h-[150px] w-full rounded-3xl" />
          </CardContent>
        </Card>
      ) : tier ? (
        <CustomReviewRulesCard token={user?.access_token} orgId={orgId} />
      ) : (
        <Card className="relative h-64 aspect-6/4 !bg-sidebar-primary">
          <div className="absolute bottom-6 left-6">
            <CardTitle className="text-lg mb-1">Try opendiff for free</CardTitle>
            <CardDescription className="text-sm text-foreground">
              No credit card required. Cancel anytime.
            </CardDescription>
            <Button className="bg-foreground hover:bg-foreground/80 text-primary-foreground mt-4">
              Get started
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
