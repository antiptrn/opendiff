import { Badge } from "components/components/ui/badge";
import { Button } from "components/components/ui/button";
import { Link } from "react-router-dom";
import { DESKTOP_NAV_LINKS } from "./header.constants";
import { useNavHover } from "./use-nav-hover";

function isExternalLink(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:");
}

/** Desktop navigation with animated hover indicator */
export function DesktopNav() {
  const { navRef, handleMouseLeave } = useNavHover();

  return (
    <nav
      ref={navRef}
      className="hidden md:flex items-center justify-center gap-1"
      onMouseLeave={handleMouseLeave}
    >
      {DESKTOP_NAV_LINKS.map((link) =>
        isExternalLink(link.href) ? (
          <Button
            key={link.href}
            size="sm"
            variant="ghost"
            asChild
            className="text-foreground pointer-events-auto"
          >
            <a href={link.href} target="_blank" rel="noreferrer">
              {link.label}
              {link.badge && <Badge variant="secondary">{link.badge}</Badge>}
            </a>
          </Button>
        ) : (
          <Button
            key={link.href}
            size="sm"
            variant="ghost"
            asChild
            className="text-foreground pointer-events-auto"
          >
            <Link to={link.href}>
              {link.label}
              {link.badge && <Badge variant="secondary">{link.badge}</Badge>}
            </Link>
          </Button>
        )
      )}
    </nav>
  );
}
