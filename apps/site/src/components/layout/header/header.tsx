import { cn } from "components";
import { Logo } from "components/components";
import { Button } from "components/components/ui/button";
import { Fade as Hamburger } from "hamburger-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { LOGIN_SHORTCUT_KEY } from "./header.constants";
import { AnnouncementBar } from "./announcement-bar";
import { MobileMenu } from "./mobile-menu";
import { SiteNavigation } from "./site-navigation";
import { useScrolled } from "./use-scrolled";
import { useKeyboardShortcut } from "./use-keyboard-shortcut";

const APP_URL = import.meta.env.VITE_APP_URL || "";

/** Site header with responsive navigation */
export function Header() {
  /** Controls mobile menu visibility */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** A navigation menu is open: the header turns solid so the menu panel reads as part of it */
  const [navigationOpen, setNavigationOpen] = useState(false);
  const scrolled = useScrolled();
  const openLogin = useCallback(() => {
    window.location.href = APP_URL;
  }, []);
  useKeyboardShortcut(LOGIN_SHORTCUT_KEY, openLogin);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex w-full flex-col transition-[background-color,backdrop-filter] duration-300",
        navigationOpen
          ? "bg-background backdrop-blur-none"
          : scrolled
            ? "bg-background/70 backdrop-blur-xl"
            : "bg-transparent backdrop-blur-none"
      )}
    >
      <AnnouncementBar />
      <div className="mx-auto flex h-18 w-full max-w-7xl flex-col justify-center lg:px-8 md:px-8 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              className="relative z-50 h-auto rounded-full px-2 lg:-mx-2 md:-mx-2 -mx-1.5 !bg-transparent"
              asChild
            >
              <Link to="/" aria-label="Home">
                <Logo />
              </Link>
            </Button>
            <SiteNavigation onOpenChange={setNavigationOpen} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" className="hidden md:inline-flex rounded-full" asChild>
              <a href={APP_URL} aria-keyshortcuts={LOGIN_SHORTCUT_KEY.toUpperCase()}>
                Log in
              </a>
            </Button>
            <Button className="hidden md:inline-flex rounded-full" asChild>
              <a href={APP_URL} aria-keyshortcuts={LOGIN_SHORTCUT_KEY.toUpperCase()}>
                Contact sales
              </a>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="relative z-50 rounded-full hover:bg-transparent md:hidden p-0 w-auto h-auto lg:-mr-0 md:-mr-0 -mr-2"
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
