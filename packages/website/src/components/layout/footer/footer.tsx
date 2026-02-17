import { Link } from "react-router-dom";

const footerLinks = [
  { label: "Changelog", href: "/changelog" },
  { label: "FAQ", href: "/#faq" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "mailto:support@opendiff.dev" },
  { label: "Status", href: "https://status.opendiff.dev" },
];

export function Footer() {
  return (
    <footer className="relative z-10 lg:py-16 md:py-16 py-8 w-full bg-background">
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5.5 px-4 w-full">
        {footerLinks.map((link) => (
          <div key={link.href}>
            <Link
              to={link.href}
              className="whitespace-nowrap text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          </div>
        ))}
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} OpenDiff</p>
      </div>
    </footer>
  );
}
