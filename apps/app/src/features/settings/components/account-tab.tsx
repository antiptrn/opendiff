import type { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { SettingsSection } from "components/components/console";
import { AccountManagementSections } from "./account-management-card";
import { ApiKeyCard } from "./api-key-card";
import { LinkGitHubRow } from "./link-github-card";

interface AccountTabProps {
  user: ReturnType<typeof useAuth>["user"];
  logout: () => void;
  orgId?: string | null;
  setUser: ReturnType<typeof useAuth>["setUser"];
}

/**
 * Account settings tab - API key, account management
 */
export function AccountTab({ user, logout, orgId, setUser }: AccountTabProps) {
  const { currentSeat, hasSeat } = useOrganization();
  const tier = hasSeat ? currentSeat?.tier : null;

  // Show GitHub linking card for non-GitHub users (Google or Microsoft)
  const needsGithubLink =
    user?.auth_provider === "google" || (user?.auth_provider as string) === "microsoft";
  const hasGithubLinked = user?.hasGithubLinked ?? false;

  const handleGithubUnlinked = () => {
    if (user) {
      setUser({ ...user, hasGithubLinked: false });
    }
  };

  return (
    <div className="space-y-10">
      {/* GitHub Account - for Google/Microsoft users (link or unlink) */}
      {needsGithubLink && (
        <SettingsSection title="Connections">
          <LinkGitHubRow
            token={user?.access_token}
            isLinked={hasGithubLinked}
            onUnlinked={handleGithubUnlinked}
          />
        </SettingsSection>
      )}

      {/* Self-sufficient API Key Card */}
      {tier === "SELF_SUFFICIENT" && <ApiKeyCard token={user?.access_token} orgId={orgId} />}

      {/* Account Management */}
      <AccountManagementSections token={user?.access_token} orgId={orgId} logout={logout} />
    </div>
  );
}
