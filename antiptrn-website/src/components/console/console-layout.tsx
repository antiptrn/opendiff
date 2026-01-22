import { Outlet, Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { OrganizationSwitcher } from "./organization-switcher";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Home, Settings, LogOut, Loader2, ChevronsUpDown, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConsoleLayout() {
  const { user, isLoading, logout } = useAuth();
  const { hasOrganizations, isLoadingOrgs, canManageMembers } = useOrganization();
  const location = useLocation();

  // Build sidebar items dynamically based on permissions
  const sidebarItems = [
    { label: "Dashboard", href: "/console", icon: Home },
    { label: "Settings", href: "/console/settings", icon: Settings },
    ...(canManageMembers ? [{ label: "Admin", href: "/console/admin", icon: Shield }] : []),
  ];

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

  // Redirect to create organization if user has no orgs
  if (!hasOrganizations) {
    return <Navigate to="/create-organization" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="fixed left-0 top-0 w-64 h-screen bg-background flex flex-col">

        <div className="px-4 pr-5 pt-4 pb-2">
          <OrganizationSwitcher />
        </div>

        <nav className="flex-1 p-4 pr-5 pt-0">
          <ul className="space-y-1">
            {sidebarItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-3.5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer flex items-center gap-3 w-full p-2 rounded-md hover:bg-muted transition-colors text-left">
              <img
                src={user.avatar_url}
                alt={user.name || user.login}
                className="size-8 rounded-full"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.name || user.login}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="size-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex-1 overflow-auto top-1 m-2 ml-0 w-[calc(100%-268px)] left-64 bg-card h-[calc(100%-24px)] fixed rounded-xl border">
        <Outlet />
      </main>
    </div>
  );
}
