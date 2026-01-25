import { useAuth } from "@features/auth";
import { useOrganization } from "@modules/organizations";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/components/ui/avatar";
import { Button } from "@shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import { TooltipContent, TooltipRoot, TooltipTrigger } from "@shared/components/ui/tooltip";
import { cn } from "@shared/lib/utils";
import {
  ChevronDown,
  FolderGit,
  Home,
  LifeBuoy,
  Loader2,
  LogOut,
  PanelLeft,
  Settings,
  Shield,
  UserPlus,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { Icon } from "../../icon";
import { OrganizationSwitcher } from "./organization-switcher";

const SIDEBAR_COLLAPSED_KEY = "antiptrn_sidebar_collapsed";

export function ConsoleLayout() {
  const { user, accounts, isLoading, logout, switchAccount, refreshAccountToken, removeAccount } = useAuth();
  const {
    organizations,
    hasOrganizations,
    isLoadingOrgs,
    hasFetchedOrgs,
    canManageMembers,
    isUnauthorized,
  } = useOrganization();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Sidebar collapsed state with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === "true";
  });

  // Track which account is being switched to (for loading state)
  const [switchingToAccountId, setSwitchingToAccountId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  // Handle account switch with loading state and token refresh
  const handleSwitchAccount = useCallback(async (account: (typeof accounts)[0]) => {
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
  }, [queryClient, switchAccount, refreshAccountToken, removeAccount]);

  const isSoloUser = user?.accountType === "SOLO";
  const showAdmin = canManageMembers && !isSoloUser;
  const [adminAnimated, setAdminAnimated] = useState(false);

  // Compute loading state early so we can use it in the effect
  const isOrgLoading = (isLoadingOrgs || !hasFetchedOrgs) && organizations.length === 0;
  const shouldAnimateAdmin = showAdmin && !isOrgLoading && !adminAnimated;

  // Mark animation as done after it plays (must be before early returns)
  useEffect(() => {
    if (shouldAnimateAdmin) {
      const timer = setTimeout(() => setAdminAnimated(true), 300);
      return () => clearTimeout(timer);
    }
  }, [shouldAnimateAdmin]);

  // Check auth and org loading first
  if (isLoading || isLoadingOrgs) {
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
  if (isUnauthorized) {
    logout();
    return <Navigate to="/login" replace />;
  }

  // Check onboarding from user object (stored in database)
  const hasCompletedOnboarding = !!user.onboardingCompletedAt;

  if (!hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect to create organization if user has no orgs (only after orgs have been fetched)
  if (hasFetchedOrgs && !hasOrganizations) {
    return <Navigate to="/create-organization" replace />;
  }

  const sidebarItems = [
    { label: "Dashboard", href: "/console", icon: Home },
    { label: "Repositories", href: "/console/repositories", icon: FolderGit },
    { label: "Settings", href: "/console/settings", icon: Settings },
  ];

  const sidebarFooterItems = [
    ...(showAdmin ? [{ label: "Admin", href: "/console/admin", icon: Shield, animate: shouldAnimateAdmin }] : []),
    { label: "Support", href: "/support", icon: LifeBuoy },
  ];

  // Helper to render nav item with optional tooltip when collapsed
  const NavItem = ({
    isCollapsed,
    item,
    isActive,
  }: {
    isCollapsed: boolean;
    item: (typeof sidebarItems)[0] & { animate?: boolean };
    isActive: boolean;
  }) => {
    const linkContent = (
      <div className={cn("overflow-hidden", item.animate && "animate-in fade-in duration-200")}>
        <Link
          to={item.href}
          className={cn(
            "group flex items-center gap-3.5 h-9 px-2.5 rounded-md text-sm font-medium",
            isActive ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <item.icon
            className={cn(
              "size-3.5 shrink-0",
              isCollapsed && "group-hover:text-foreground",
              isActive ? "text-foreground" : "text-muted-foreground"
            )}
            strokeWidth={2.4}
          />
          {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
        </Link>
      </div>
    );

    if (isCollapsed) {
      return (
        <TooltipRoot>
          <TooltipTrigger delay={0} asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </TooltipRoot>
      );
    }

    return linkContent;
  };

  return (
    <div className="min-h-screen bg-background flex">
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 52 : 240 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="fixed left-0 top-0 h-screen bg-background flex flex-col"
      >
        <motion.div
          initial={false}
          animate={{ paddingLeft: isCollapsed ? 8 : 16, paddingRight: 16 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="pt-4 pb-4 flex flex-row items-center"
        >
          {!isCollapsed && (
            !isOrgLoading && organizations.length > 0 ? (
              <OrganizationSwitcher />
            ) : (
              <Link to="/" className="px-3 h-9 flex items-center"><Icon /></Link>
            )
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 p-0 hover:!bg-sidebar-primary hover:text-sidebar-primary-foreground rounded-lg shrink-0 ml-auto"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <PanelLeft className="size-4" />
          </Button>
        </motion.div>

        <motion.nav
          initial={false}
          animate={{ paddingLeft: isCollapsed ? 8 : 16, paddingRight: isCollapsed ? 8 : 16 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={cn("flex-1 pt-0")}
        >
          <ul className="space-y-1">
            {sidebarItems.map((item) => {
              // Dashboard needs exact match, others use startsWith for nested routes
              const isActive =
                item.href === "/console"
                  ? location.pathname === item.href
                  : location.pathname.startsWith(item.href);
              return (
                <li key={item.href} className="h-9">
                  <NavItem isCollapsed={isCollapsed} item={item} isActive={isActive} />
                </li>
              );
            })}
          </ul>
        </motion.nav>

        <motion.div
          initial={false}
          animate={{ paddingLeft: isCollapsed ? 8 : 12, paddingRight: isCollapsed ? 8 : 12 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="py-3"
        >
          <ul className="space-y-1 mb-2">
            {sidebarFooterItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <li key={item.href} className="h-9">
                  <NavItem isCollapsed={isCollapsed} item={item} isActive={isActive} />
                </li>
              );
            })}
          </ul>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="cursor-pointer flex items-center gap-2.5 p-1.5 rounded-lg group text-left overflow-hidden"
              >
                <Avatar className="size-6 rounded-sm overflow-hidden shrink-0">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback>{user.login.charAt(0)}</AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0 flex items-center gap-2 whitespace-nowrap text-foreground/80 group-hover:text-foreground transition-colors">
                    <p className="text-sm truncate flex-1">{user.login}</p>
                    <ChevronDown className="size-4 shrink-0" />
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-64">
              {/* Current user with submenu for account switching */}
              <DropdownMenuSub>
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <DropdownMenuSubTrigger className="flex items-center">
                  Switch account
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  {/* Other accounts to switch to */}
                  {accounts.filter((a) => String(a.visitorId || a.id) !== String(user.visitorId || user.id))
                    .length > 0 && (
                      <>
                        <DropdownMenuLabel>Switch account</DropdownMenuLabel>
                        {accounts
                          .filter(
                            (account) =>
                              String(account.visitorId || account.id) !== String(user.visitorId || user.id)
                          )
                          .map((account) => {
                            const accountId = String(account.visitorId || account.id);
                            const isSwitching = switchingToAccountId === accountId;
                            return (
                              <DropdownMenuItem
                                key={accountId}
                                onClick={() => handleSwitchAccount(account)}
                                disabled={isSwitching || !!switchingToAccountId}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                {isSwitching ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Avatar className="size-4 !rounded-[4px] overflow-hidden">
                                    <AvatarImage src={account.avatar_url} />
                                    <AvatarFallback>{account.login.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                )}
                                <span>{account.login}</span>
                              </DropdownMenuItem>
                            );
                          })}
                        <DropdownMenuSeparator />
                      </>
                    )}

                  {/* Add account */}
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link
                      to={`/login?addAccount=true&redirectUrl=${encodeURIComponent(location.pathname)}`}
                    >
                      <UserPlus className="size-3.5" />
                      Add account
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              {/* Sign out - in main dropdown */}
              <DropdownMenuItem onClick={logout} className="cursor-pointer">
                <LogOut className="size-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      </motion.aside>

      <motion.main
        initial={false}
        animate={{
          left: isCollapsed ? 52 : 240,
          width: isCollapsed ? "calc(100% - 60px)" : "calc(100% - 248px)",
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="border flex-1 overflow-auto top-1 m-1 ml-0 bg-background dark:bg-card h-[calc(100%-18px)] fixed rounded-xl"
      >
        <Outlet />
      </motion.main>
    </div>
  );
}
