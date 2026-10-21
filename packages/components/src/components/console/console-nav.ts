import {
  BookOpenTextIcon,
  ClipboardCheckIcon,
  CodeIcon,
  CreditCardIcon,
  FolderGitIcon,
  LayoutGridIcon,
  LifebuoyIcon,
  PaintBoardIcon,
  Settings01Icon,
  Shield01Icon,
  SparklesIcon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import type { AppSidebarNavGroup } from "./app-sidebar";

export const SETTINGS_HREF = "/console/settings";

/** The console sidebar's link groups; the admin link only shows for people who can manage members */
export function getConsoleNavGroups({
  showAdmin = false,
}: { showAdmin?: boolean } = {}): AppSidebarNavGroup[] {
  return [
    {
      label: "Workspace",
      items: [
        { label: "Dashboard", href: "/console", icon: LayoutGridIcon },
        { label: "Pull Requests", href: "/console/pull-requests", icon: ClipboardCheckIcon },
        { label: "Repositories", href: "/console/repositories", icon: FolderGitIcon },
      ],
    },
    {
      label: "Organization",
      items: [
        { label: "Settings", href: SETTINGS_HREF, icon: Settings01Icon },
        ...(showAdmin ? [{ label: "Admin", href: "/console/admin", icon: Shield01Icon }] : []),
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Docs", href: "https://docs.opendiff.dev", icon: BookOpenTextIcon },
        {
          label: "Support",
          href: "mailto:support@opendiff.dev?subject=Support%20Request",
          icon: LifebuoyIcon,
        },
      ],
    },
  ];
}

/** Settings categories, by the path segment after /console/settings */
export type SettingsTab =
  | "appearance"
  | "account"
  | "skills"
  | "code-review"
  | "organization"
  | "billing";

/**
 * The sidebar's links while in settings: one unlabelled group, one link per category. Team and
 * Billing only show when they apply to the current organization.
 */
export function getSettingsNavGroups({
  showOrganization = false,
  showBilling = false,
}: {
  showOrganization?: boolean;
  showBilling?: boolean;
} = {}): AppSidebarNavGroup[] {
  const href = (tab: SettingsTab) => `${SETTINGS_HREF}/${tab}`;
  return [
    {
      items: [
        { label: "Appearance", href: href("appearance"), icon: PaintBoardIcon },
        { label: "Account", href: href("account"), icon: UserIcon },
        { label: "Skills", href: href("skills"), icon: SparklesIcon },
        { label: "Code Review", href: href("code-review"), icon: CodeIcon },
        ...(showOrganization
          ? [{ label: "Team", href: href("organization"), icon: UserGroupIcon }]
          : []),
        ...(showBilling ? [{ label: "Billing", href: href("billing"), icon: CreditCardIcon }] : []),
      ],
    },
  ];
}
