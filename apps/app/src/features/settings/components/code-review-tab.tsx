import { ExternalLinkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "components/components/ui/button";
import { SettingsRow, SettingsSection } from "components/components/console";
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
  const githubAppSlug =
    import.meta.env.VITE_GITHUB_APP_SLUG ||
    (import.meta.env.DEV ? "opendiff-agent-local" : "opendiff-agent");
  const installUrl = `https://github.com/apps/${githubAppSlug}/installations/new`;

  return (
    <div className="space-y-10">
      {/* Install GitHub App - only show if user has GitHub access */}
      {hasGithubAccess && (
        <SettingsSection title="GitHub">
          <SettingsRow
            title="GitHub App"
            description="Install the app on your repositories to enable code reviews, on your personal account or any organization you have access to."
          >
            <Button asChild>
              <a href={installUrl} target="_blank" rel="noopener noreferrer">
                Install GitHub App
                <HugeiconsIcon icon={ExternalLinkIcon} className="size-4" />
              </a>
            </Button>
          </SettingsRow>
        </SettingsSection>
      )}

      <CustomReviewRulesCard token={user?.access_token} orgId={orgId} />
    </div>
  );
}
