import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { cn } from "@/lib/utils";
import { ChevronDown, FileText, Home, LifeBuoy, Loader2, LogOut, Settings, Shield, UserPlus } from "lucide-react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { OrganizationSwitcher } from "./organization-switcher";

export function ConsoleLayout() {
  const { user, accounts, isLoading, logout, switchAccount } = useAuth();
  const { organizations, hasOrganizations, isLoadingOrgs, isLoadingDetails, hasFetchedOrgs, canManageMembers, isUnauthorized } = useOrganization();
  const location = useLocation();

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

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="fixed left-0 top-0 w-60 h-screen bg-background flex flex-col">

        {organizations.length > 0 && (
          <div className="pl-4 pt-4 pr-2 pb-4 flex flex-row items-center justify-between">
            <OrganizationSwitcher />
          </div>
        )}

        <nav className={cn("flex-1 p-4 pt-0", organizations.length === 0 && "pt-4")}>
          <ul className="space-y-1">
            {sidebarItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("size-3.5 text-muted-foreground", isActive && "text-foreground")} strokeWidth={2.4} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-3">
          <ul className="space-y-1 mb-2">
            {sidebarFooterItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3.5 px-3 py-2 font-medium rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("size-3.5 text-muted-foreground", isActive && "text-foreground")} strokeWidth={2.4} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer flex items-center gap-2.5 w-full p-2 rounded-md group transition-colors text-left">
              <Avatar className="size-6 rounded-sm overflow-hidden">
                <AvatarImage src={user.avatar_url} />
                <AvatarFallback>{user.login.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  {user.login}
                </p>
              </div>
              <ChevronDown className="size-3.5 text-foreground/80 group-hover:text-foreground" />
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
        </div>
      </aside>

      <main className="border flex-1 overflow-auto top-1 m-1 ml-0 w-[calc(100%-248px)] left-60 bg-card h-[calc(100%-18px)] fixed rounded-xl">
        <Outlet />
      </main>
    </div>
  );
}
