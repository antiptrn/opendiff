import { Link } from "react-router-dom";
import { MOBILE_NAV_LINKS } from "./header.constants";

function isExternalLink(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:");
}

interface MobileMenuProps {
  onClose: () => void;
}

/** Expandable mobile navigation menu */
export function MobileMenu({ onClose }: MobileMenuProps) {
  return (
    <div className="md:hidden h-screen fixed inset-0 z-40 bg-background p-1.5 pt-16">
      <nav className="flex flex-col gap-2">
        {MOBILE_NAV_LINKS.map((link) =>
          isExternalLink(link.href) ? (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 text-2xl tracking-tighter text-foreground"
              onClick={onClose}
            >
              {link.label}
            </a>
          ) : (
            <Link
              key={link.href}
              to={link.href}
              className="px-3 py-2 text-2xl tracking-tighter text-foreground"
              onClick={onClose}
            >
              {link.label}
            </Link>
          )
        )}
      </nav>
    </div>
  );
}
