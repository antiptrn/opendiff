import { SiGithub } from "@icons-pack/react-simple-icons";
import { Icon, Separator } from "components/components";
import { Button } from "components/components/ui/button";
import { Fade as Hamburger } from "hamburger-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { DesktopNav } from "./desktop-nav";
import { MobileMenu } from "./mobile-menu";

const APP_URL = import.meta.env.VITE_APP_URL || "";

/** Site header with responsive navigation */
export function Header() {
  /** Controls mobile menu visibility */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <header className="absolute z-50 top-0 left-0 right-0">
      <div className="mx-auto max-w-6xl lg:px-8 md:px-8 px-4 lg:py-4 md:py-4 py-2">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="relative z-50 h-auto px-2 lg:-mx-2 md:-mx-2 -mx-1.5 !bg-transparent"
            asChild
          >
            <Link to="/" aria-label="OpenDiff home">
              <Icon />
            </Link>
          </Button>
          <div className="hidden md:flex items-center justify-center gap-3">
            <DesktopNav />
            <Separator orientation="vertical" className="h-6 !self-center mx-1" />
            <Button size="sm" variant="ghost" asChild>
              <Link to="https://github.com/open-diff/open-diff">
                <SiGithub className="size-4 text-foreground" />
                51k
              </Link>
            </Button>
            <Button size="sm" asChild>
              <a href={APP_URL}>Log in</a>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="relative z-50 hover:bg-transparent md:hidden p-0 w-auto h-auto lg:-mr-0 md:-mr-0 -mr-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close mobile menu" : "Open mobile menu"}
          >
            <Hamburger size={18} toggled={mobileMenuOpen} />
          </Button>
        </div>
        {mobileMenuOpen && <MobileMenu onClose={() => setMobileMenuOpen(false)} />}
      </div>
    </header>
  );
}
