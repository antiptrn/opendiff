import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dropdown-menu";
import { TooltipRoot, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { cn } from "@/lib/utils";
import { ChevronDown, FileText, Home, LifeBuoy, Loader2, LogOut, PanelLeftClose, PanelLeft, Settings, Shield, UserPlus } from "lucide-react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { OrganizationSwitcher } from "./organization-switcher";

const SIDEBAR_COLLAPSED_KEY = "antiptrn_sidebar_collapsed";

export function ConsoleLayout() {
  const { user, accounts, isLoading, logout, switchAccount } = useAuth();
  const { organizations, hasOrganizations, isLoadingOrgs, isLoadingDetails, hasFetchedOrgs, canManageMembers, isUnauthorized } = useOrganization();
  const location = useLocation();

  // Sidebar collapsed state with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

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
  if (isUnauthorized) {
    logout();
    return <Navigate to="/login" replace />;
  }

  // Check onboarding from user object (stored in database)
  const hasCompletedOnboarding = !!user.onboardingCompletedAt;
  const isSoloUser = user.accountType === "SOLO";

  if (!hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // Now wait for org data to load
  if (isLoadingOrgs || isLoadingDetails || !hasFetchedOrgs) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Redirect to create organization if user has no orgs (only after orgs have been fetched)
  if (!hasOrganizations) {
    return <Navigate to="/create-organization" replace />;
  }

  // Build sidebar items dynamically based on permissions
  // Solo users don't see Admin tab even if they technically have permissions
  const showAdmin = canManageMembers && !isSoloUser;
  const sidebarItems = [
    { label: "Dashboard", href: "/console", icon: Home },
    { label: "Reviews", href: "/console/reviews", icon: FileText },
    { label: "Settings", href: "/console/settings", icon: Settings },
    ...(showAdmin ? [{ label: "Admin", href: "/console/admin", icon: Shield }] : []),
  ];

  const sidebarFooterItems = [
    { label: "Support", href: "/support", icon: LifeBuoy },
    ...(showAdmin ? [{ label: "Admin", href: "/console/admin", icon: Shield }] : []),
  ];

  // Helper to render nav item with optional tooltip when collapsed
  const NavItem = ({ item, isActive }: { item: typeof sidebarItems[0]; isActive: boolean }) => {
    const linkContent = (
      <motion.div
        initial={false}
        animate={{ width: isCollapsed ? 36 : 208 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <Link
          to={item.href}
          className={cn(
            "flex items-center gap-3.5 h-9 px-2.5 rounded-md text-sm font-medium",
            isActive
              ? "bg-card text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <item.icon className={cn("size-3.5 shrink-0", isActive ? "text-foreground" : "text-muted-foreground")} strokeWidth={2.4} />
          {!isCollapsed && (
            <span className="whitespace-nowrap">
              {item.label}
            </span>
          )}
        </Link>
      </motion.div>
    );

    if (isCollapsed) {
      return (
        <TooltipRoot delay={0}>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right">
            {item.label}
          </TooltipContent>
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
          animate={{ paddingLeft: isCollapsed ? 8 : 16, paddingRight: 8 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="pt-4 pb-4 flex flex-row items-center justify-between"
        >
          {organizations.length > 0 && !isCollapsed && <OrganizationSwitcher />}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 p-0 rounded-lg shrink-0"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <PanelLeft className="size-3.5" />
            ) : (
              <PanelLeftClose className="size-3.5" />
            )}
          </Button>
        </motion.div>

        <motion.nav
          initial={false}
          animate={{ paddingLeft: isCollapsed ? 8 : 16, paddingRight: isCollapsed ? 8 : 16 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={cn("flex-1 pt-0", organizations.length === 0 && "pt-4")}
        >
          <ul className="space-y-1">
            {sidebarItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.href} className="h-9">
                  <NavItem item={item} isActive={isActive} />
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
              const isActive = location.pathname === item.href;
              return (
                <li key={item.href} className="h-9">
                  <NavItem item={item} isActive={isActive} />
                </li>
              );
            })}
          </ul>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                initial={false}
                animate={{ width: isCollapsed ? 36 : 216 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="cursor-pointer flex items-center gap-2.5 p-1.5 rounded-md group text-left overflow-hidden"
              >
                <Avatar className="size-6 rounded-sm overflow-hidden shrink-0">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback>{user.login.charAt(0)}</AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0 flex items-center gap-2.5 whitespace-nowrap">
                    <p className="text-sm truncate flex-1">
                      {user.login}
                    </p>
                    <ChevronDown className="size-3.5 text-foreground/80 group-hover:text-foreground shrink-0" />
                  </div>
                )}
              </motion.button>
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
                  {accounts.filter(a => (a.visitorId || a.id) !== (user.visitorId || user.id)).length > 0 && (
                    <>
                      <DropdownMenuLabel>Switch account</DropdownMenuLabel>
                      {accounts
                        .filter(account => (account.visitorId || account.id) !== (user.visitorId || user.id))
                        .map((account) => {
                          const accountId = account.visitorId || account.id;
                          return (
                            <DropdownMenuItem
                              key={String(accountId)}
                              onClick={() => switchAccount(accountId)}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Avatar className="size-4 !rounded-[4px] overflow-hidden">
                                <AvatarImage src={account.avatar_url} />
                                <AvatarFallback>{account.login.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span>{account.login}</span>
                            </DropdownMenuItem>
                          );
                        })}
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {/* Add account */}
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to={`/login?addAccount=true&redirectUrl=${encodeURIComponent(location.pathname)}`}>
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
          width: isCollapsed ? "calc(100% - 60px)" : "calc(100% - 248px)"
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="border flex-1 overflow-auto top-1 m-1 ml-0 bg-background dark:bg-card h-[calc(100%-18px)] fixed rounded-xl"
      >
        <Outlet />
      </motion.main>
    </div>
  );
}
