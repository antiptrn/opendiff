import { SiGithub } from "@icons-pack/react-simple-icons";
import { Logo } from "components/components";
import { Button } from "components/components/ui/button";
import { Fade as Hamburger } from "hamburger-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DesktopNav } from "./desktop-nav";
import { MobileMenu } from "./mobile-menu";

const APP_URL = import.meta.env.VITE_APP_URL || "";
// You can override this at build-time via VITE_GITHUB_REPO (e.g. "antiptrn/opendiff")
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || "antiptrn/opendiff";

function formatStarCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

function useGitHubStars(repo: string) {
  const storageKey = useMemo(() => `opendiff:github-stars:${repo}`, [repo]);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const cachedRaw =
      typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { value: number; fetchedAt: number };
        const isFresh = Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000;
        if (Number.isFinite(cached.value)) {
          setStars(cached.value);
        }
        if (isFresh) {
          return () => {
            cancelled = true;
          };
        }
      } catch {
        // ignore cache parse errors
      }
    }

    async function fetchStars() {
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: {
            Accept: "application/vnd.github+json",
          },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { stargazers_count?: number };
        const count = data.stargazers_count;
        if (typeof count !== "number" || !Number.isFinite(count)) return;
        if (cancelled) return;

        setStars(count);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({ value: count, fetchedAt: Date.now() })
          );
        }
      } catch {
        // best-effort
      }
    }

    void fetchStars();
    return () => {
      cancelled = true;
    };
  }, [repo, storageKey]);

  return stars;
}

/** Site header with responsive navigation */
export function Header() {
  /** Controls mobile menu visibility */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const stars = useGitHubStars(GITHUB_REPO);
  const githubUrl = `https://github.com/${GITHUB_REPO}`;
  const starsLabel = formatStarCount(stars ?? 0);
  const hasShownStarsRef = useRef(false);
  const [showStars, setShowStars] = useState(false);

  useEffect(() => {
    if (stars == null) return;
    if (hasShownStarsRef.current) return;
    hasShownStarsRef.current = true;
    setShowStars(true);
  }, [stars]);
  return (
    <header className="absolute flex w-full items-center justify-start z-50 top-0 left-0 right-0 h-18">
      <div className="mx-auto w-full max-w-6xl lg:px-8 md:px-8 px-4 lg:py-4 md:py-4 py-2">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="relative z-50 h-auto px-2 lg:-mx-2 md:-mx-2 -mx-1.5 !bg-transparent"
            asChild
          >
            <Link to="/" aria-label="OpenDiff home">
              <Logo />
            </Link>
          </Button>
          <div className="hidden md:flex items-center justify-center gap-1">
            <DesktopNav />
            <Button size="sm" variant="ghost" className="text-foreground mr-3" asChild>
              <Link to={githubUrl} aria-label="OpenDiff on GitHub">
                <SiGithub className="size-4" />
                <span
                  className={`tabular-nums transition-opacity duration-500 ease-out motion-reduce:transition-none ${
                    showStars ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {starsLabel}
                </span>
              </Link>
            </Button>
            <Button size="sm" asChild>
              <a href={APP_URL}>Log in</a>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="relative z-50 hover:bg-transparent md:hidden p-0 w-auto h-auto lg:-mr-0 md:-mr-0 -mr-2"
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
