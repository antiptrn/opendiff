import { Fade as Hamburger } from "hamburger-react";
import { Icon } from "opendiff-components/components";
import { Button } from "opendiff-components/components/ui/button";
import { useState } from "react";
import { Link } from "react-router-dom";
import { DesktopNav } from "./desktop-nav";
import { MobileMenu } from "./mobile-menu";
import { SiGithub } from "@icons-pack/react-simple-icons";

const APP_URL = import.meta.env.VITE_APP_URL || "";

/** Site header with responsive navigation */
export function Header() {
  /** Controls mobile menu visibility */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <header className="absolute z-10 top-4 lg:left-2 md:left-2 left-3 right-2">
      <div className="mx-auto lg:px-8 md:px-8 px-6">
        <div className="flex items-center justify-between lg:h-20 md:h-20 h-18">
          <Button variant="ghost" className="relative z-10 h-auto px-2 lg:-mx-2 md:-mx-2 -mx-1.5 !bg-transparent" asChild>
            <Link to="/">
              <Icon />
            </Link>
          </Button>
          <DesktopNav />
          <div className="hidden md:flex items-center gap-3">
            <Button size="sm" variant="ghost">
              <SiGithub className="size-4 text-foreground" />
              51k
            </Button>
            <Button size="sm" asChild>
              <a href={APP_URL}>Log In</a>
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
