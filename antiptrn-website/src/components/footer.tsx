import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

const footerLinks = {
  services: [
    { label: "AI Tool Integration", href: "#services" },
    { label: "Workflow Automation", href: "#services" },
    { label: "Team Training", href: "#services" },
    { label: "Security & Compliance", href: "#services" },
  ],
  company: [
    { label: "About Us", href: "#" },
    { label: "Case Studies", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Careers", href: "#" },
  ],
  resources: [
    { label: "Documentation", href: "#" },
    { label: "AI Tools Guide", href: "#" },
    { label: "Best Practices", href: "#" },
    { label: "Newsletter", href: "#" },
  ],
};

export function Footer() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      if (stored) {
        return stored === "dark";
      }
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  return (
    <footer className="py-16 w-full border-t">
      <div className="container mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="">

          <div className="flex gap-8 mb-16 justify-between">

            <div>
              <h3 className="mb-3 text-sm">Services</h3>
              <ul className="space-y-1.5">
                {footerLinks.services.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-3 text-sm">Company</h3>
              <ul className="space-y-1.5">
                {footerLinks.company.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-3 text-sm">Resources</h3>
              <ul className="space-y-1.5">
                {footerLinks.resources.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-3 text-sm">Resources</h3>
              <ul className="space-y-1.5">
                {footerLinks.resources.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Separator />
          <div className="pt-16 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex gap-4 items-center">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 -ml-2"
                onClick={() => setIsDark(!isDark)}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} antiptrn AB
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
