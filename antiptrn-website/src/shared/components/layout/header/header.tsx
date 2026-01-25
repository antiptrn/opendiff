import { Button } from "@shared/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../icon";
import { DesktopNav } from "./desktop-nav";
import { MobileMenu } from "./mobile-menu";

/** Site header with responsive navigation */
export function Header() {
  /** Controls mobile menu visibility */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Button
            variant="ghost"
            className="h-auto px-2 -mx-2 !bg-transparent"
            onClick={() => navigate("/")}
          >
            <Icon />
          </Button>

          <DesktopNav />

          <div className="hidden md:flex items-center gap-3">
            <Button
              onClick={() => navigate("/login")}
              variant="ghost"
              className="rounded-full"
              size="lg"
            >
              Log In
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>

        {mobileMenuOpen && <MobileMenu onClose={() => setMobileMenuOpen(false)} />}
      </div>
    </header>
  );
}
