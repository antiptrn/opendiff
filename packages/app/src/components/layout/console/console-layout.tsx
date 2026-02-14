import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "components/components";
import { useThemeCookieSync } from "components/hooks";
import { ClipboardCheck, FolderGit, Loader2, Shield } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { FeedbackDialog } from "./feedback-dialog";
import { NavItem, type NavItemConfig } from "./nav-item";
import { NotificationPopover } from "./notification-popover";
import { UserMenu } from "./user-menu";

export function ConsoleLayout() {
  const { user, accounts, isLoading, logout, switchAccount, refreshAccountToken, removeAccount } =
    useAuth();
  const {
    hasOrganizations,
    isLoadingOrgs,
    isLoadingDetails,
    hasFetchedOrgs,
    canManageMembers,
    isUnauthorized,
    currentOrgId,
    orgDetails,
  } = useOrganization();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Sync theme with cookie for cross-origin persistence
  useThemeCookieSync({ cookieDomain: import.meta.env.VITE_THEME_COOKIE_DOMAIN });

  // Track which account is being switched to (for loading state)
  const [switchingToAccountId, setSwitchingToAccountId] = useState<string | null>(null);

  // Handle account switch with loading state and token refresh
  const handleSwitchAccount = useCallback(
    async (account: (typeof accounts)[0]) => {
      const accountId = String(account.visitorId || account.id);
      setSwitchingToAccountId(accountId);

      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

      const tryFetchOrgs = async (token: string) => {
        const response = await fetch(`${API_URL}/api/organizations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return response;
      };

      try {
        // Try to fetch organizations with current token
        let response = await tryFetchOrgs(account.access_token || "");

        // If unauthorized, try to refresh the token
        if (response.status === 401) {
          const refreshedAccount = await refreshAccountToken(account);

          if (refreshedAccount?.access_token) {
            // Retry with new token
            response = await tryFetchOrgs(refreshedAccount.access_token);

            if (response.ok) {
              const orgData = await response.json();
              queryClient.setQueryData(["organizations", accountId], orgData);
              switchAccount(accountId);
              return;
            }
          }

          // Refresh failed - remove the account and show error
          console.error("Token refresh failed, removing stale account");
          removeAccount(accountId);
          return;
        }

        if (!response.ok) {
          console.error("Failed to fetch organizations:", response.status);
          return;
        }

        const orgData = await response.json();

        // Pre-populate the query cache with the correct key for the new user
        queryClient.setQueryData(["organizations", accountId], orgData);

        // Now switch - the org data is already cached
        switchAccount(accountId);
      } finally {
        setSwitchingToAccountId(null);
      }
    },
    [queryClient, switchAccount, refreshAccountToken, removeAccount]
  );

  const isSoloUser = user?.accountType === "SOLO";
  const showAdmin = canManageMembers && !isSoloUser;

  // Feedback dialog state
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Check auth loading first
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

  // If token is expired/invalid, log out and redirect to login
  // Must check before the loading guard — a 401 leaves currentOrgId null,
  // which makes waitingForOrgs true and traps us on the spinner forever.
  if (isUnauthorized) {
    logout();
    return <Navigate to="/login" replace />;
  }

  // Wait for org data - check both loading states AND if we need data we don't have yet
  // The gap between query enabled and isLoading=true causes a brief flash without this
  // Also wait if we have no currentOrgId yet (orgs still loading/computing)
  const needsOrgDetails = currentOrgId && !orgDetails;
  const waitingForOrgs = !currentOrgId && user.onboardingCompletedAt;
  if (isLoadingOrgs || isLoadingDetails || needsOrgDetails || waitingForOrgs) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Check onboarding from user object (stored in database)
  const hasCompletedOnboarding = !!user.onboardingCompletedAt;

  if (!hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect to create organization if user has no orgs (only after orgs have been fetched)
  // Solo users always have a personal org — skip this check to avoid a race with stale cache
  if (hasFetchedOrgs && !hasOrganizations && user.accountType !== "SOLO") {
    return <Navigate to="/create-organization" replace />;
  }

  const navItems: NavItemConfig[] = [
    { label: "Pull Requests", href: "/console/pull-requests", icon: ClipboardCheck },
    { label: "Repositories", href: "/console/repositories", icon: FolderGit },
    ...(showAdmin ? [{ label: "Admin", href: "/console/admin", icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-20 flex items-center shrink-0 px-8">
        {/* Left: Org switcher */}
        <div className="flex items-center shrink-0">
          <Link to="/console" className="flex items-center">
            <Icon />
          </Link>
        </div>

        {/* Center: Nav items */}
        <nav className="flex items-center h-full ml-4">
          {navItems.map((item) => {
            const isActive =
              item.href === "/console"
                ? location.pathname === item.href
                : location.pathname.startsWith(item.href);
            return <NavItem key={item.href} item={item} isActive={isActive} />;
          })}
        </nav>

        {/* Right: Notifications, User */}
        <div className="flex items-center gap-4 ml-auto h-full">
          <NotificationPopover />
          <UserMenu
            user={user}
            accounts={accounts}
            switchingToAccountId={switchingToAccountId}
            onSwitchAccount={handleSwitchAccount}
            onFeedbackClick={() => setFeedbackOpen(true)}
            onLogout={logout}
          />
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        accessToken={user?.access_token}
      />
    </div>
  );
}
