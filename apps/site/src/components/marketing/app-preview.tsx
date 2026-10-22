import {
  AppSidebar,
  buildConsoleCrumbs,
  ConsoleTopBar,
  DashboardOverview,
  type DashboardStats,
  getConsoleNavGroups,
  NotificationButton,
  SETTINGS_HREF,
} from "components/components/console";
import { SidebarInset, SidebarProvider } from "components/components/ui/sidebar";

const PREVIEW_STATS: DashboardStats = {
  connectedRepos: 24,
  totalRepos: 31,
  reviewCount: 1284,
  issuesFound: 3917,
  issuesFixed: 3260,
};

const NAV_GROUPS = getConsoleNavGroups();
const CRUMBS = buildConsoleCrumbs("/console", NAV_GROUPS, SETTINGS_HREF);

// biome-ignore lint/a11y/useAnchorContent: the sidebar and top bar fill in each link's content
const previewLink = (href: string) => <a href={href} onClick={(event) => event.preventDefault()} />;

/**
 * The console as it looks signed in, built from the same sidebar and dashboard components as the
 * app, with sample data. Links stay put so the page doesn't navigate away.
 */
export function AppPreview() {
  return (
    <SidebarProvider keyboardShortcut={null} className="h-full min-h-0 overflow-hidden">
      <AppSidebar
        collapsible="none"
        navGroups={NAV_GROUPS}
        pathname="/console"
        userName="Ada Lovelace"
        organizationName="Acme"
        footerAction={<NotificationButton hasUnread />}
        renderLink={previewLink}
      />
      <SidebarInset className="min-h-0">
        <ConsoleTopBar crumbs={CRUMBS} renderLink={previewLink} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DashboardOverview stats={PREVIEW_STATS} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
