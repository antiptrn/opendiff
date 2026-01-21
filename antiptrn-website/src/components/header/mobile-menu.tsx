import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "./header.constants";

interface MobileMenuProps {
  onClose: () => void;
}

/** Expandable mobile navigation menu */
export function MobileMenu({ onClose }: MobileMenuProps) {
  return (
    <div className="md:hidden py-4 border-t">
      <nav className="flex flex-col gap-2">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            onClick={onClose}
          >
            {link.label}
          </a>
        ))}
        <div className="flex flex-col gap-2 mt-2 pt-2 border-t">
          <Button variant="ghost" asChild className="justify-start">
            <a href="#contact">Contact</a>
          </Button>
          <Button asChild>
            <a href="#contact">Get Started</a>
          </Button>
        </div>
      </nav>
    </div>
  );
}
