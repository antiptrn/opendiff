import { Button, Logo } from "components/components";
import type { MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";

type FooterLink = {
  label: string;
  href: string;
  fallbackHref?: string;
};

const PROTOCOL_FALLBACK_DELAY_MS = 800;

const footerSections: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "/#overview" },
      { label: "Pricing", href: "/pricing" },
      { label: "FAQ", href: "/#faq" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Careers", href: "https://careers.opendiff.dev" },
      { label: "Blog", href: "/blog" },
      { label: "GitHub", href: "https://github.com/antiptrn/opendiff" },
      { label: "Contact", href: "mailto:support@opendiff.dev" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "https://docs.opendiff.dev" },
      { label: "Comparisons", href: "/comparisons" },
      { label: "Cursor Extension", href: "cursor:extension/opendiff.opendiff-local-review" },
      {
        label: "VSCode Extension",
        href: "vscode:extension/opendiff.opendiff-local-review",
        fallbackHref:
          "https://marketplace.visualstudio.com/items?itemName=opendiff.opendiff-local-review",
      },
    ],
  },
];

function onProtocolLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  fallbackHref: string
) {
  event.preventDefault();

  const clearListeners = () => {
    window.clearTimeout(timeout);
    window.removeEventListener("blur", clearListeners);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      clearListeners();
    }
  };

  const timeout = window.setTimeout(() => {
    clearListeners();
    window.open(fallbackHref, "_blank", "noopener,noreferrer");
  }, PROTOCOL_FALLBACK_DELAY_MS);

  window.addEventListener("blur", clearListeners, { once: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.location.href = href;
}

function isExternalLink(href: string): boolean {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("cursor:") ||
    href.startsWith("vscode:") ||
    href.startsWith("vscode-insiders:")
  );
}

export function Footer() {
  const location = useLocation();

  const onHashLinkClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    const [path, rawHash] = href.split("#");
    if (!rawHash) {
      return;
    }

    const targetPath = path || location.pathname;
    const targetHash = `#${rawHash}`;
    if (location.pathname !== targetPath) {
      return;
    }

    event.preventDefault();

    if (location.hash !== targetHash) {
      window.history.replaceState(null, "", `${targetPath}${targetHash}`);
    }

    const target = document.getElementById(decodeURIComponent(rawHash));
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <footer className="relative z-10 w-full border-t bg-background py-16 lg:mt-16 md:mt-16 mt-8">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <div className="flex w-full flex-col justify-between gap-10 lg:flex-row lg:items-start lg:text-left">
          <div className="flex w-full flex-col justify-between gap-6 lg:items-start">
            <div className="flex items-center gap-2 lg:justify-start">
              <Link to="/" aria-label="OpenDiff home">
                <Logo />
              </Link>
            </div>
            <p className="max-w-[80%] text-base text-muted-foreground">
              AI-powered code review that finds issues early and helps your team ship faster with
              confidence.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-6">
              <Link target="_blank" rel="noreferrer" to="https://status.opendiff.dev">
                <div className="size-1.5 bg-green-400 mr-1" />
                All systems operational
              </Link>
            </Button>
          </div>

          <div className="grid w-full gap-6 md:grid-cols-3 lg:gap-20">
            {footerSections.map((section) => (
              <div key={section.title}>
                <h3 className="mb-4">{section.title}</h3>
                <ul className="space-y-4 text-sm text-muted-foreground">
                  {section.links.map((link) => (
                    <li key={link.href} className="font-medium hover:text-primary">
                      {isExternalLink(link.href) ? (
                        link.fallbackHref ? (
                          <a
                            href={link.href}
                            onClick={(event) =>
                              onProtocolLinkClick(event, link.href, link.fallbackHref as string)
                            }
                          >
                            {link.label}
                          </a>
                        ) : (
                          <a
                            href={link.href}
                            target={link.href.startsWith("http") ? "_blank" : undefined}
                            rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                          >
                            {link.label}
                          </a>
                        )
                      ) : (
                        <Link
                          to={link.href}
                          onClick={
                            link.href.includes("#")
                              ? (event) => onHashLinkClick(event, link.href)
                              : undefined
                          }
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col justify-between gap-4 border-t pt-16 text-sm font-medium text-muted-foreground md:flex-row md:items-center md:text-left">
          <p className="order-2 lg:order-1">
            &copy; {new Date().getFullYear()} OpenDiff. All rights reserved.
          </p>
          <ul className="order-1 flex flex-col gap-8 md:order-2 md:flex-row">
            <li className="hover:text-primary">
              <Link to="/terms">Terms</Link>
            </li>
            <li className="hover:text-primary">
              <Link to="/privacy">Privacy</Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
