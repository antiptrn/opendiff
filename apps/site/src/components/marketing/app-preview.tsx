import {
  AppSidebar,
  buildConsoleCrumbs,
  ConsoleTopBar,
  FilterPopover,
  getConsoleNavGroups,
  ListHeader,
  ListTab,
  NotificationButton,
  PullRequestRow,
  type PullRequestRowItem,
  SETTINGS_HREF,
  SortMenu,
} from "components/components/console";
import { Checkbox } from "components/components/ui/checkbox";
import { SidebarInset, SidebarProvider } from "components/components/ui/sidebar";
import { useState } from "react";

const NAV_GROUPS = getConsoleNavGroups();
const PATHNAME = "/console/pull-requests";
const CRUMBS = buildConsoleCrumbs(PATHNAME, NAV_GROUPS, SETTINGS_HREF);

const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const FRONTEND = { name: "frontend", color: "3b82f6" };
const BACKEND = { name: "backend", color: "22c55e" };
const SECURITY = { name: "security", color: "ef4444" };

// Sample pull requests for a made-up team, so the preview looks like a busy week in the console
const PREVIEW_PULL_REQUESTS: Array<PullRequestRowItem & { id: string }> = [
  {
    id: "1",
    pullNumber: 482,
    pullTitle: "Retry failed webhook deliveries with backoff",
    owner: "acme",
    repo: "api",
    pullAuthor: "ada",
    authorAvatarUrl: "/images/avatars/avatar-1.svg",
    state: "open",
    draft: false,
    labels: [BACKEND],
    githubCommentCount: 4,
    openedAt: hoursAgo(2),
    commentCount: 3,
  },
  {
    id: "2",
    pullNumber: 1207,
    pullTitle: "Move checkout to the new payment form",
    owner: "acme",
    repo: "web",
    pullAuthor: "grace",
    authorAvatarUrl: "/images/avatars/avatar-2.svg",
    state: "open",
    draft: false,
    labels: [FRONTEND],
    githubCommentCount: 9,
    openedAt: hoursAgo(5),
    commentCount: 5,
  },
  {
    id: "3",
    pullNumber: 479,
    pullTitle: "Validate redirect URLs on sign-in",
    owner: "acme",
    repo: "api",
    pullAuthor: "linus",
    authorAvatarUrl: "/images/avatars/avatar-3.svg",
    state: "open",
    draft: false,
    labels: [SECURITY, BACKEND],
    githubCommentCount: 6,
    openedAt: hoursAgo(9),
    commentCount: 2,
  },
  {
    id: "4",
    pullNumber: 1204,
    pullTitle: "Lazy-load the analytics dashboard charts",
    owner: "acme",
    repo: "web",
    pullAuthor: "ada",
    authorAvatarUrl: "/images/avatars/avatar-1.svg",
    state: "open",
    draft: false,
    labels: [FRONTEND],
    githubCommentCount: 2,
    openedAt: hoursAgo(26),
    commentCount: 1,
  },
  {
    id: "5",
    pullNumber: 318,
    pullTitle: "Offline queue for photo uploads",
    owner: "acme",
    repo: "mobile",
    pullAuthor: "grace",
    authorAvatarUrl: "/images/avatars/avatar-2.svg",
    state: "open",
    draft: true,
    labels: [],
    githubCommentCount: 0,
    openedAt: hoursAgo(50),
    commentCount: 0,
  },
  {
    id: "6",
    pullNumber: 476,
    pullTitle: "Speed up the nightly invoice export",
    owner: "acme",
    repo: "api",
    pullAuthor: "linus",
    authorAvatarUrl: "/images/avatars/avatar-3.svg",
    state: "open",
    draft: false,
    labels: [BACKEND],
    githubCommentCount: 3,
    openedAt: hoursAgo(74),
    commentCount: 4,
  },
];

const AUTHORS = ["ada", "grace", "linus"];
const REPOS = ["acme/api", "acme/mobile", "acme/web"];
const SORT_OPTIONS = [
  { value: "reviewed", label: "Recently reviewed" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

// biome-ignore lint/a11y/useAnchorContent: the sidebar and top bar fill in each link's content
const previewLink = (href: string) => <a href={href} onClick={(event) => event.preventDefault()} />;

/**
 * The console as it looks signed in, on the Pull Requests tab: the same sidebar, top bar and pull
 * request list components as the app, with sample pull requests. Ticking rows and opening the
 * menus works; links stay put so the page doesn't navigate away.
 */
export function AppPreview() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [authors, setAuthors] = useState<string[]>([]);
  const [repos, setRepos] = useState<string[]>([]);
  const [sort, setSort] = useState("reviewed");

  const rows = PREVIEW_PULL_REQUESTS.filter(
    (row) =>
      (authors.length === 0 || (row.pullAuthor !== null && authors.includes(row.pullAuthor))) &&
      (repos.length === 0 || repos.includes(`${row.owner}/${row.repo}`))
  );
  const selectedShown = rows.filter((row) => selected.has(row.id)).length;
  const allSelected = rows.length > 0 && selectedShown === rows.length;

  return (
    // Always open: otherwise it picks up a collapsed state saved from the console and the top bar
    // shows the button that brings the sidebar back
    <SidebarProvider open keyboardShortcut={null} className="h-full min-h-0 overflow-hidden">
      <AppSidebar
        collapsible="none"
        navGroups={NAV_GROUPS}
        pathname={PATHNAME}
        userName="Ada Lovelace"
        organizationName="Acme"
        footerAction={<NotificationButton hasUnread />}
        renderLink={previewLink}
      />
      <SidebarInset className="min-h-0">
        <ConsoleTopBar crumbs={CRUMBS} renderLink={previewLink} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex w-full max-w-6xl flex-col p-4">
            <div className="overflow-hidden rounded-lg border border-border-solid">
              <ListHeader>
                <Checkbox
                  aria-label="Select all pull requests"
                  className="mr-1"
                  checked={allSelected ? true : selectedShown > 0 ? "indeterminate" : false}
                  onCheckedChange={() =>
                    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))
                  }
                />
                {selectedShown > 0 ? (
                  <span className="px-1 text-sm">{selectedShown} selected</span>
                ) : (
                  <div className="flex items-center">
                    <ListTab label="Open" count={rows.length} active onClick={() => {}} />
                    <ListTab label="Closed" count={128} active={false} onClick={() => {}} />
                  </div>
                )}
                <div className="ml-auto flex flex-wrap items-center">
                  <FilterPopover
                    label="Author"
                    title="Filter by author"
                    options={AUTHORS}
                    selected={authors}
                    onChange={setAuthors}
                  />
                  <FilterPopover
                    label="Repository"
                    title="Filter by repository"
                    options={REPOS}
                    selected={repos}
                    onChange={setRepos}
                  />
                  <SortMenu value={sort} options={SORT_OPTIONS} onChange={setSort} />
                </div>
              </ListHeader>
              <ul aria-label="Pull requests">
                {rows.map((row) => (
                  <PullRequestRow
                    key={row.id}
                    pullRequest={row}
                    selected={selected.has(row.id)}
                    onSelectedChange={(isSelected) =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (isSelected) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      })
                    }
                    onOpen={() => {}}
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
