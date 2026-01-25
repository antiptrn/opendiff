import type { useAuth } from "@features/auth";
import { useOrganization } from "@modules/organizations";
import { ApiKeyCard } from "./api-key-card";
import { AccountManagementCard } from "./account-management-card";
import { LinkGitHubCard } from "./link-github-card";

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
  const needsGithubLink = user?.auth_provider === "google" || user?.auth_provider === "microsoft";
  const hasGithubLinked = user?.hasGithubLinked ?? false;

  const handleGithubUnlinked = () => {
    if (user) {
      setUser({ ...user, hasGithubLinked: false });
    }
  };

  return (
    <div className="space-y-6">
      {/* GitHub Account - for Google/Microsoft users (link or unlink) */}
      {needsGithubLink && (
        <LinkGitHubCard
          token={user?.access_token}
          isLinked={hasGithubLinked}
          onUnlinked={handleGithubUnlinked}
          onLogout={logout}
        />
      )}

      {/* BYOK API Key Card */}
      {tier === "BYOK" && <ApiKeyCard token={user?.access_token} orgId={orgId} />}

      {/* Account Management */}
      <AccountManagementCard token={user?.access_token} orgId={orgId} logout={logout} />
    </div>
  );
}
