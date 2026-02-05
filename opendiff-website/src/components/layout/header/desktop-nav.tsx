import { Badge } from "opendiff-components/components/ui/badge";
import { Button } from "opendiff-components/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DESKTOP_NAV_LINKS } from "./header.constants";
import { useNavHover } from "./use-nav-hover";

/** Desktop navigation with animated hover indicator */
export function DesktopNav() {
  const { navRef, handleMouseLeave } = useNavHover();
  const navigate = useNavigate();
  return (
    <nav
      ref={navRef}
      className="relative w-full hidden md:flex items-start px-3 gap-4"
      onMouseLeave={handleMouseLeave}
    >
      {DESKTOP_NAV_LINKS.map((link) => (
        <Button
          key={link.href}
          onClick={() => navigate(link.href)}
          variant="ghost"
          className="text-muted-foreground"
        >
          {link.label}
          {link.badge && <Badge variant="secondary">{link.badge}</Badge>}
        </Button>
      ))}
    </nav>
  );
}
