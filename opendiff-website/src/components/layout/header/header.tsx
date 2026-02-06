import { SiGithub } from "@icons-pack/react-simple-icons";
import { Fade as Hamburger } from "hamburger-react";
import { Icon } from "opendiff-components/components";
import { Button } from "opendiff-components/components/ui/button";
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
    <header className="absolute z-10 top-0 left-0 right-0 border-b">
      <div className="mx-auto max-w-5xl lg:px-8 md:px-8 px-6 py-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" className="relative z-10 h-auto px-2 lg:-mx-2 md:-mx-2 -mx-1.5 !bg-transparent" asChild>
            <Link to="/">
              <Icon />
            </Link>
          </Button>
          <DesktopNav />
          <div className="hidden md:flex items-center gap-3">
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
            className="relative z-10 hover:bg-transparent md:hidden p-0 w-auto h-auto lg:-mr-3 md:-mr-3 -mr-0"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Hamburger size={18} toggled={mobileMenuOpen} />
          </Button>
        </div>
        {mobileMenuOpen && <MobileMenu onClose={() => setMobileMenuOpen(false)} />}
      </div>
    </header>
  );
}
