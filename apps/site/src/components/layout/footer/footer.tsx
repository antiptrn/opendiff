import { Logo } from "components/components";
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
      { label: "Changelog", href: "/changelog" },
      { label: "For Cursor", href: "cursor:extension/opendiff.opendiff-local-review" },
      {
        label: "For VSCode",
        href: "vscode:extension/opendiff.opendiff-local-review",
        fallbackHref:
          "https://marketplace.visualstudio.com/items?itemName=opendiff.opendiff-local-review",
      },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Careers", href: "https://careers.opendiff.dev" },
      { label: "Blog", href: "/blog" },
      { label: "Press", href: "mailto:support@opendiff.dev?subject=Press%20inquiry" },
      { label: "GitHub", href: "https://github.com/antiptrn/opendiff" },
      { label: "Contact", href: "mailto:support@opendiff.dev" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "https://docs.opendiff.dev" },
      { label: "Comparisons", href: "/comparisons" },
      { label: "Service Status", href: "https://status.opendiff.dev" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
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
    <footer className="relative z-10 w-full bg-background pt-16">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex w-full flex-col justify-between gap-10 lg:flex-row lg:items-start lg:text-left">
          <div className="flex w-full flex-col justify-between gap-6 lg:w-1/4 lg:items-start">
            <div className="flex items-center gap-2 lg:justify-start">
              <Link to="/" aria-label="OpenDiff home">
                <Logo />
              </Link>
            </div>
          </div>

          <div className="grid w-full gap-6 md:grid-cols-4 lg:w-3/4 lg:gap-12">
            {footerSections.map((section) => (
              <div key={section.title}>
                <p className="mb-4 text-base">{section.title}</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {section.links.map((link) => (
                    <li key={link.href} className="font-normal whitespace-nowrap hover:text-foreground">
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

        <div className="mt-16 flex flex-col justify-between gap-4 border-t pt-16 text-sm font-normal text-muted-foreground md:flex-row md:items-center md:text-left">
          <p>
            &copy; {new Date().getFullYear()} Contrast by Orange Matter AB. All rights reserved.
          </p>
        </div>
      </div>

      {/* Oversized logo that runs off the bottom edge, sized to the footer's content width so its
          edges line up with the columns above */}
      <div aria-hidden="true" className="mx-auto mt-16 max-w-7xl overflow-hidden px-4 lg:px-8">
        <div className="@container w-full">
          <div className="-mb-[0.32em] flex h-[1.08em] w-full items-center justify-between text-muted-foreground/25 [font-size:calc(100cqw/5)]">
            <svg className="size-[0.9em] shrink-0" viewBox="0 0 1500 1500" fill="currentColor">
              <rect width="1500" height="1500" />
              <path className="fill-background" d="M750 0L1125 375L750 750L1125 1125L750 1500L0 750Z" />
            </svg>
            <span className="shrink-0 leading-none tracking-tight">Contrast</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
