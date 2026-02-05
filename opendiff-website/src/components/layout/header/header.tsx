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
    <header className="fixed top-0 left-0 right-0 z-50 bg-background">
      <div className="mx-auto lg:px-8 md:px-8 px-6">
        <div className="flex items-center justify-between lg:h-20 md:h-20 h-18">
          <Button variant="ghost" className="h-auto px-2 -mx-2 !bg-transparent" asChild>
            <Link to="/">
              <Icon />
            </Link>
          </Button>
          <DesktopNav />
          <div className="hidden md:flex items-center">
            <Button variant="ghost" asChild>
              <a href={APP_URL}>Log In</a>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="relative z-10 hover:bg-transparent md:hidden p-0 w-auto h-auto -mr-3"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Hamburger size={20} toggled={mobileMenuOpen} />
          </Button>
        </div>
        {mobileMenuOpen && <MobileMenu onClose={() => setMobileMenuOpen(false)} />}
      </div>
    </header>
  );
}
