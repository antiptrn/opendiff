const DOCS_URL = "https://docs.opendiff.dev";

export interface NavigationMenuLink {
  label: string;
  href: string;
}

export interface NavigationMenuGroup {
  /** Small heading above the group's links */
  label: string;
  links: NavigationMenuLink[];
}

export interface NavigationEntry {
  /** Opens a hover menu with these groups, one column each */
  menu?: NavigationMenuGroup[];
  /** Navigates directly when clicked */
  href?: string;
}

/** Header navigation next to the logo; entries with a menu open it on hover or focus */
export const NAVIGATION_ITEMS = {
  Product: {
    menu: [
      {
        label: "Review",
        links: [
          { label: "Code reviews", href: "/" },
          { label: "Merge safety", href: DOCS_URL },
          { label: "Rules & skills", href: DOCS_URL },
        ],
      },
      {
        label: "Fix",
        links: [
          { label: "Auto-fix", href: DOCS_URL },
          {
            label: "Editor extensions",
            href: "https://marketplace.visualstudio.com/items?itemName=opendiff.opendiff-local-review",
          },
        ],
      },
    ],
  },
  Resources: {
    menu: [
      {
        label: "Learn",
        links: [
          { label: "Documentation", href: DOCS_URL },
          { label: "Changelog", href: "/changelog" },
          { label: "Blog", href: "/blog" },
        ],
      },
      {
        label: "Compare",
        links: [{ label: "Comparisons", href: "/comparisons" }],
      },
    ],
  },
  Company: {
    menu: [
      {
        label: "Company",
        links: [
          { label: "Careers", href: "https://careers.opendiff.dev" },
          { label: "GitHub", href: "https://github.com/antiptrn/opendiff" },
        ],
      },
      {
        label: "Support",
        links: [{ label: "Contact", href: "mailto:support@opendiff.dev" }],
      },
    ],
  },
  Pricing: { href: "/pricing" },
} as const satisfies Record<string, NavigationEntry>;

export type NavigationItem = keyof typeof NAVIGATION_ITEMS;
