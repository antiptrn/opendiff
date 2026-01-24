import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/logo";
import { DesktopNav } from "./desktop-nav";
import { MobileMenu } from "./mobile-menu";
import { useNavigate } from "react-router-dom";

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
            className="h-auto px-0 !bg-transparent"
            onClick={() => navigate("/")}
          >
            <Logo />
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
