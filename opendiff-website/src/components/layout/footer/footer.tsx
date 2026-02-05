import { Icon } from "opendiff-components/components";
import { Link } from "react-router-dom";

const footerLinks = {
  services: [
    { label: "use opendiff", href: "#" },
    { label: "use opendiff", href: "#" },
    { label: "use opendiff", href: "#" },
    { label: "use opendiff", href: "#" },
  ],
  company: [
    { label: "use opendiff", href: "#" },
    { label: "use opendiff", href: "#" },
    { label: "use opendiff", href: "#" },
    { label: "use opendiff", href: "#" },
  ],
};

export function Footer() {
  return (
    <footer className="py-16 w-full">
      <div className="container mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="">
          <div className="flex lg:flex-row md:flex-col flex-col gap-8 mb-16 justify-between">
            <div className="lg:w-1/3 md:w-full w-full flex flex-col gap-6 lg:mb-0 md:mb-6 mb-6">
              <Icon />
              <p className="text-base text-muted-foreground">
                OpenDiff is an open-source AI code-review platform.
              </p>
            </div>
            <div className="flex flex-row lg:gap-24 md:gap-0 gap-0 lg:w-1/3 md:w-full w-full">
              <ul className="space-y-2 lg:w-fit w-1/2 w-1/2">
                {footerLinks.services.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="whitespace-nowrap font-medium text-base text-foreground hover:text-foreground/80 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
              <ul className="space-y-2 lg:w-fit w-1/2 w-1/2">
                {footerLinks.company.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="whitespace-nowrap font-medium text-base text-foreground hover:text-foreground/80 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="lg:pt-16 md:pt-0 pt-0 flex flex-row justify-between items-center gap-4">
            <div className="lg:w-1/3 md:w-full w-full flex flex-row items-center gap-4">
              <p className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} OpenDiff
              </p>
            </div>
            <div className="flex flex-row lg:gap-24 md:gap-8 gap-8 lg:w-1/3 md:w-full w-full">
              <div>
                <Link
                  to="/privacy"
                  className="whitespace-nowrap text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </Link>
              </div>
              <div>
                <Link
                  to="/terms"
                  className="whitespace-nowrap text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
