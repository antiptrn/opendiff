import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "./header.constants";
import { useNavHover } from "./use-nav-hover";
import { useNavigate } from "react-router-dom";

/** Desktop navigation with animated hover indicator */
export function DesktopNav() {
  const { navRef, handleMouseLeave } = useNavHover();
  const navigate = useNavigate();
  return (
    <nav
      ref={navRef}
      className="relative hidden md:flex items-center gap-4"
      onMouseLeave={handleMouseLeave}
    >
      {NAV_LINKS.map((link) => (
        <Button
          onClick={() => navigate(link.href)}
          variant="ghost"
          className="text-sm text-muted-foreground hover:text-foreground !bg-transparent"
        >
          {link.label}
          {link.badge && <Badge variant="secondary">{link.badge}</Badge>}
        </Button>
      ))}
    </nav>
  );
}
