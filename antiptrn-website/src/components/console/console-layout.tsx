import { Outlet, Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import Logo from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Home, Settings, LogOut, Loader2, ChevronsUpDown, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const sidebarItems = [
  { label: "Dashboard", href: "/console", icon: Home },
  { label: "Settings", href: "/console/settings", icon: Settings },
  { label: "Billing", href: "/console/billing", icon: CreditCard },
];

export function ConsoleLayout() {
  const { user, isLoading, logout } = useAuth();
  const location = useLocation();

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

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 bg-background border-r flex flex-col">
        <div className="py-4 px-6">
          <Link to="/">
            <Logo />
          </Link>
        </div>

        <nav className="flex-1 p-2 pt-0">
          <ul className="space-y-1">
            {sidebarItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-card"
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

        <div className="p-3 border-border">
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

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
