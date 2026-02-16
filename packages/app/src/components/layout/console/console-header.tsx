import { Icon } from "components";
import { Avatar, AvatarFallback, AvatarImage } from "components/components/ui/avatar";
import { Badge } from "components/components/ui/badge";
import { Button } from "components/components/ui/button";
import { cn } from "components/utils";
import { BookOpenText, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ConsoleHeaderNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface ConsoleHeaderProps {
  email?: string | null;
  organizationName?: string | null;
  organizationAvatarUrl?: string | null;
  showOrganizationAvatar?: boolean;
  planLabel: string;
  navItems: ConsoleHeaderNavItem[];
  pathname: string;
  onResourceHubClick?: () => void;
  rightContent: ReactNode;
}

export function ConsoleHeader({
  email,
  organizationName,
  organizationAvatarUrl,
  showOrganizationAvatar,
  planLabel,
  navItems,
  pathname,
  onResourceHubClick,
  rightContent,
}: ConsoleHeaderProps) {
  return (
    <header className="shrink-0 border-b bg-card dark:bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/console"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {showOrganizationAvatar ? (
              <Avatar className="size-7">
                <AvatarImage
                  src={organizationAvatarUrl || undefined}
                  alt={organizationName || "Org"}
                />
                <AvatarFallback className="text-[12px]">
                  {(organizationName || email || "O").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Icon className="size-6" />
            )}
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-lg">{organizationName || email || "Console workspace"}</p>
            <Badge className="bg-background dark:bg-muted" variant="secondary">
              {planLabel}
            </Badge>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">{rightContent}</div>
      </div>

      <div>
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-2 sm:px-4 lg:px-6">
          <nav className="scrollbar-none flex h-full min-w-0 flex-1 gap-1 items-center overflow-x-auto">
            {navItems.map((item) => {
              const isActive =
                item.href === "/console" ? pathname === item.href : pathname.startsWith(item.href);

              return (
                <Button
                  variant="ghost"
                  asChild
                  key={item.href}
                  className={cn(
                    "px-3 relative text-muted-foreground hover:text-foreground",
                    isActive &&
                      "text-foreground after:absolute after:-bottom-2 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-primary"
                  )}
                >
                  <Link key={item.href} to={item.href}>
                    <item.icon className="size-4 -mt-0.5" />
                    <span>{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>

          <Button
            disabled
            variant="ghost"
            className="ml-2 -mr-2 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onResourceHubClick}
          >
            <BookOpenText className="size-4" />
            Resources
          </Button>
        </div>
      </div>
    </header>
  );
}
