import type { NavLink } from "./header.types";

/** Primary navigation links displayed in the header */
export const DESKTOP_NAV_LINKS: NavLink[] = [
  { label: "Pricing", href: "/pricing" },
  { label: "Company", href: "/company" },
  { label: "Resources", href: "/resources" },
];

export const MOBILE_NAV_LINKS: NavLink[] = [
  { label: "Sign in", href: `${import.meta.env.VITE_APP_URL || ""}/login` },
  { label: "Pricing", href: "/pricing" },
];
