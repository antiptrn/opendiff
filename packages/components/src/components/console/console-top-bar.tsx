import { Menu01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, type ReactElement, type ReactNode, type Ref } from "react";
import { Icon } from "../icon";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";
import { Button } from "../ui/button";
import { SidebarTrigger, useSidebar } from "../ui/sidebar";
import { TopBar } from "../ui/top-bar";
import type { AppSidebarNavGroup } from "./app-sidebar";

export interface ConsoleCrumb {
  label: string;
  href?: string;
}

/** The sidebar link that owns `pathname`: an exact match, or the longest matching parent path */
function findNavItem(pathname: string, groups: AppSidebarNavGroup[]) {
  let best: { label: string; href: string } | undefined;
  for (const item of groups.flatMap((group) => group.items)) {
    const matches =
      pathname === item.href || (item.href !== "/console" && pathname.startsWith(`${item.href}/`));
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/**
 * Breadcrumb for a console path, from the sidebar's own labels: "Settings" first while in
 * settings, then the sidebar link the page belongs to, then an optional trailing crumb.
 */
export function buildConsoleCrumbs(
  pathname: string,
  groups: AppSidebarNavGroup[],
  settingsHref: string,
  trail?: string
): ConsoleCrumb[] {
  const crumbs: ConsoleCrumb[] = [];
  if (pathname.startsWith(settingsHref)) crumbs.push({ label: "Settings", href: settingsHref });
  const item = findNavItem(pathname, groups);
  if (item && item.href !== settingsHref) crumbs.push({ label: item.label, href: item.href });
  if (trail) crumbs.push({ label: trail });
  return crumbs;
}

/**
 * Bar above every console page with a breadcrumb in place of a page title. It also holds the
 * button that brings back a collapsed sidebar, and on mobile the logo and the menu button.
 * `renderLink` builds the router's link element for an href.
 */
export function ConsoleTopBar({
  crumbs,
  renderLink,
  actions,
  actionsRef,
  search,
  searchRef,
}: {
  crumbs: ConsoleCrumb[];
  renderLink: (href: string) => ReactElement;
  /** Buttons at the right of the bar */
  actions?: ReactNode;
  /** Receives the element at the right of the bar, so pages can render actions into it */
  actionsRef?: Ref<HTMLDivElement>;
  /** Search at the right of the bar, before the actions, such as a TopBarSearch */
  search?: ReactNode;
  /** Receives the element that holds the search, so pages can render their search into it */
  searchRef?: Ref<HTMLDivElement>;
}) {
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar();

  return (
    <TopBar inset="sidebar">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {isMobile ? (
            <BreadcrumbLink
              aria-label="Dashboard"
              className="flex shrink-0 items-center"
              render={renderLink("/console")}
            >
              <Icon />
            </BreadcrumbLink>
          ) : state === "collapsed" ? (
            <SidebarTrigger />
          ) : null}
          <Breadcrumb className="min-w-0">
            <BreadcrumbList>
              {crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1;
                return (
                  <Fragment key={`${crumb.label}-${index}`}>
                    {index > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem truncate>
                      {isLast || !crumb.href ? (
                        <BreadcrumbPage truncate>{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          className="text-muted-foreground hover:text-foreground"
                          render={renderLink(crumb.href)}
                        >
                          {crumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <div ref={searchRef} className="flex items-center empty:hidden">
            {search}
          </div>
          <div ref={actionsRef} className="flex items-center gap-2 empty:hidden">
            {actions}
          </div>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={openMobile ? "Close menu" : "Open menu"}
              aria-expanded={openMobile}
              onClick={toggleSidebar}
            >
              <HugeiconsIcon icon={Menu01Icon} />
            </Button>
          )}
        </div>
      </div>
    </TopBar>
  );
}
