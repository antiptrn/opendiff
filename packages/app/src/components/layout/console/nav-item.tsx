import { Button } from "components/components";
import { cn } from "components/utils";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

/** Configuration for a navigation link. */
export interface NavItemConfig {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Horizontal navigation tab item. */
export function NavItem({
  item,
  isActive,
}: {
  item: NavItemConfig;
  isActive: boolean;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      className={cn(isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      <Link to={item.href}>
        <span className="whitespace-nowrap">{item.label}</span>
      </Link>
    </Button>
  );
}
