import { useQueryClient } from "@tanstack/react-query";
import {
  AppSidebar,
  getConsoleNavGroups,
  getSettingsNavGroups,
  SETTINGS_HREF,
} from "components/components/console";
import { useThemeCookieSync } from "components/hooks";
import { SidebarInset, SidebarProvider } from "components/components/ui/sidebar";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "shared/auth";
import { NavigationScrollToTop } from "shared/navigation";
import { useOrganization } from "shared/organizations";
import { useSettingsTabs } from "@/features/settings";
import { ConsoleTopBar, ConsoleTopBarProvider } from "./console-top-bar";
import { FeedbackDialog } from "./feedback-dialog";
import { NotificationPopover } from "./notification-popover";
import { OrganizationMenu } from "./organization-menu";
import { UserMenu } from "./user-menu";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
    currentOrg,
    orgDetails,
  } = useOrganization();
  const location = useLocation();
  const { showOrganization, showBilling } = useSettingsTabs();
  const queryClient = useQueryClient();
  const mainRef = useRef<HTMLDivElement | null>(null);
  const getMainElement = useCallback(() => mainRef.current, []);

  // Sync theme with cookie for cross-origin persistence
  useThemeCookieSync({ cookieDomain: import.meta.env.VITE_THEME_COOKIE_DOMAIN });

  // Track which account is being switched to (for loading state)
  const [switchingToAccountId, setSwitchingToAccountId] = useState<string | null>(null);
  const prefetchedAiModelsOrgIdRef = useRef<string | null>(null);

  // Prefetch AI model catalogs for settings while app is still in initial loading flows.
  useEffect(() => {
    if (!user?.access_token || !currentOrgId) {
      return;
    }

    if (prefetchedAiModelsOrgIdRef.current === currentOrgId) {
      return;
    }

    prefetchedAiModelsOrgIdRef.current = currentOrgId;

    for (const provider of ["anthropic", "openai"] as const) {
      queryClient.prefetchQuery({
        queryKey: ["aiModels", provider, currentOrgId],
        queryFn: async () => {
          const response = await fetch(
            `${API_URL}/api/settings/ai-models?provider=${encodeURIComponent(provider)}`,
            {
              headers: {
                Authorization: `Bearer ${user.access_token}`,
                "X-Organization-Id": currentOrgId,
              },
            }
          );

          if (!response.ok) {
            throw new Error("Failed to prefetch AI models");
          }

          return response.json();
        },
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [user?.access_token, currentOrgId, queryClient]);

  // Handle account switch with loading state and token refresh
  const handleSwitchAccount = useCallback(
    async (account: (typeof accounts)[0]) => {
      const accountId = String(account.visitorId || account.id);
      setSwitchingToAccountId(accountId);

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
        <HugeiconsIcon icon={Loading03Icon} className="size-8 animate-spin text-muted-foreground" />
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
        <HugeiconsIcon icon={Loading03Icon} className="size-8 animate-spin text-muted-foreground" />
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

  // In settings the sidebar lists the settings categories instead, with a way back
  const inSettings = location.pathname.startsWith(SETTINGS_HREF);
  const navGroups = inSettings
    ? getSettingsNavGroups({ showOrganization, showBilling })
    : getConsoleNavGroups({ showAdmin });

  return (
    <SidebarProvider persistenceKey="console.sidebar" className="h-svh bg-background">
      <ConsoleTopBarProvider>
      <NavigationScrollToTop getContainer={getMainElement} />
      <AppSidebar
        navGroups={navGroups}
        backLink={inSettings ? { label: "Go back", href: "/console" } : undefined}
        pathname={location.pathname}
        userName={user.name || user.login || user.email || "Account"}
        userAvatarUrl={user.avatar_url}
        footerAction={<NotificationPopover />}
        renderLink={(href) => <Link to={href} />}
        organizationName={currentOrg?.name || orgDetails?.name || "Personal"}
        organizationAvatarUrl={currentOrg?.avatarUrl || orgDetails?.avatarUrl}
        renderOrganizationMenu={(trigger) => <OrganizationMenu trigger={trigger} />}
        renderAccountMenu={(trigger) => (
          <UserMenu
            user={user}
            accounts={accounts}
            switchingToAccountId={switchingToAccountId}
            onSwitchAccount={handleSwitchAccount}
            onFeedbackClick={() => setFeedbackOpen(true)}
            onLogout={logout}
            trigger={trigger}
          />
        )}
      />

      <SidebarInset className="h-svh">
        <ConsoleTopBar
          navGroups={navGroups}
          settingsHref={SETTINGS_HREF}
          pathname={location.pathname}
        />
        <div ref={mainRef} className="flex-1 overflow-auto">
          {/* Fills the scroll area so a page can stretch its content, such as a centred empty state */}
          <div className="flex min-h-full w-full flex-col">
            <Outlet />
          </div>
        </div>
      </SidebarInset>

      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        accessToken={user?.access_token}
      />
      </ConsoleTopBarProvider>
    </SidebarProvider>
  );
}
