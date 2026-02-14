import { useTheme } from "next-themes";
import { useEffect } from "react";

const COOKIE_NAME = "opendiff-theme";

/** Read theme from cookie */
function getThemeCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? match[1] : null;
}

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function resolveCookieDomain(hostname: string, configuredDomain?: string): string {
  if (configuredDomain?.trim()) {
    const normalized = configuredDomain.trim().replace(/^\.+/, "");
    return `.${normalized}`;
  }

  if (hostname === "localhost" || isIpAddress(hostname)) {
    return "";
  }

  const parts = hostname.split(".").filter(Boolean);
  if (parts.length < 2) {
    return "";
  }

  return `.${parts.slice(-2).join(".")}`;
}

/** Set theme cookie (accessible across subdomains in production) */
function setThemeCookie(theme: string, configuredDomain?: string) {
  if (typeof document === "undefined") return;
  const hostname = window.location.hostname;
  const cookieDomain = resolveCookieDomain(hostname, configuredDomain);
  const domainAttr = cookieDomain ? `; domain=${cookieDomain}` : "";
  document.cookie = `${COOKIE_NAME}=${theme}; path=/; max-age=31536000; SameSite=Lax${domainAttr}`;
}

/**
 * Hook to sync next-themes with a cookie for cross-origin persistence.
 * Use this in your app's root layout or main component.
 */
export function useThemeCookieSync(options?: { cookieDomain?: string }) {
  const { theme, setTheme } = useTheme();

  // On mount, check if cookie has a different theme and sync
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally runs only on mount to sync from cookie
  useEffect(() => {
    const cookieTheme = getThemeCookie();
    if (cookieTheme && (cookieTheme === "dark" || cookieTheme === "light")) {
      // Only update if different from current theme
      if (cookieTheme !== theme) {
        setTheme(cookieTheme);
      }
    }
  }, []);

  // When theme changes, update the cookie
  useEffect(() => {
    if (theme && theme !== "system") {
      setThemeCookie(theme, options?.cookieDomain);
    }
  }, [theme, options?.cookieDomain]);
}
