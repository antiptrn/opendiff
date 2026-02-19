import type { NavLink } from "./types";

/** Primary navigation links displayed in the header */
export const DESKTOP_NAV_LINKS: NavLink[] = [
  { label: "Docs", href: "https://docs.opendiff.dev" },
  { label: "Blog", href: "/blog" },
  { label: "Changelog", href: "/changelog" },
  { label: "Pricing", href: "/pricing" },
];

export const MOBILE_NAV_LINKS: NavLink[] = [
  { label: "Docs", href: "https://docs.opendiff.dev" },
  { label: "Blog", href: "/blog" },
  { label: "Changelog", href: "/changelog" },
  { label: "Sign in", href: `${import.meta.env.VITE_APP_URL || ""}/login` },
  { label: "Pricing", href: "/pricing" },
];
