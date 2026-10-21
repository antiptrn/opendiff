import { ArrowDown01Icon, ArrowLeft01Icon, MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { Icon } from "../icon";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuIcon,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";

export interface AppSidebarNavItem {
  label: string;
  href: string;
  icon: IconSvgElement;
}

export interface AppSidebarNavGroup {
  /** Heading above the group; leave it out for a group without one */
  label?: string;
  items: AppSidebarNavItem[];
}

interface AppSidebarProps {
  navGroups: AppSidebarNavGroup[];
  pathname: string;
  userName: string;
  userAvatarUrl?: string | null;
  /** Action at the right of the user row, such as notifications */
  footerAction?: ReactNode;
  /** Wraps the user row in the footer, such as a dropdown menu */
  renderAccountMenu?: (trigger: ReactNode) => ReactNode;
  /** The organization the console is showing; shown as a menu trigger at the top instead of the icon */
  organizationName?: string;
  organizationAvatarUrl?: string | null;
  /** Wraps the organization row at the top, such as a dropdown for switching organizations */
  renderOrganizationMenu?: (trigger: ReactNode) => ReactNode;
  /**
   * Element used for in-app links, such as a router link; it receives the link's className and
   * children. Defaults to a plain anchor.
   */
  renderLink?: (href: string) => ReactElement;
  /** Where the logo links to, and the one path that only counts as active when matched exactly */
  homeHref?: string;
  /** "none" renders the sidebar in place, such as inside a preview, instead of fixed to the viewport */
  collapsible?: "offcanvas" | "icon" | "none";
  /** Shows a back link above the groups, such as "Go back" while in settings */
  backLink?: { label: string; href: string };
}

// biome-ignore lint/a11y/useAnchorContent: callers fill in the link's content
const defaultRenderLink = (href: string) => <a href={href} />;

function isActivePath(pathname: string, href: string, homeHref: string) {
  return href === homeHref ? pathname === href : pathname.startsWith(href);
}

function isExternal(href: string) {
  return /^(https?:|mailto:)/.test(href);
}

function NavLink({
  item,
  pathname,
  homeHref,
  renderLink,
}: {
  item: AppSidebarNavItem;
  pathname: string;
  homeHref: string;
  renderLink: (href: string) => ReactElement;
}) {
  const external = isExternal(item.href);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={!external && isActivePath(pathname, item.href, homeHref)}
        variant="primaryNavigation"
        render={
          external ? (
            // biome-ignore lint/a11y/useAnchorContent: SidebarMenuButton renders the label and icon into it
            <a
              href={item.href}
              target={item.href.startsWith("http") ? "_blank" : undefined}
              rel={item.href.startsWith("http") ? "noreferrer" : undefined}
            />
          ) : (
            renderLink(item.href)
          )
        }
      >
        <SidebarMenuIcon>
          <HugeiconsIcon icon={item.icon} />
        </SidebarMenuIcon>
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Console sidebar: logo and collapse button on top, labelled groups of links, and the signed-in
 * user at the bottom with their account menu and notifications.
 */
export function AppSidebar({
  navGroups,
  pathname,
  userName,
  userAvatarUrl,
  footerAction,
  renderAccountMenu = (trigger) => trigger,
  organizationName,
  organizationAvatarUrl,
  renderOrganizationMenu = (trigger) => trigger,
  renderLink = defaultRenderLink,
  homeHref = "/console",
  collapsible,
  backLink,
}: AppSidebarProps) {
  const { isMobile } = useSidebar();
  return (
    // On mobile the sidebar slides in from the right, next to the menu button; a sidebar rendered
    // in place (such as in a preview) stays on the left
    <Sidebar collapsible={collapsible} side={isMobile && collapsible !== "none" ? "right" : "left"}>
      <SidebarHeader>
        <div className="flex min-w-0 items-center justify-between gap-0.5">
          {organizationName ? (
            <div className="min-w-0">
              <SidebarMenu>
                <SidebarMenuItem>
                  {renderOrganizationMenu(
                    <SidebarMenuButton
                      labelOverflow="custom"
                      spacing="account"
                      type="button"
                      variant="account"
                      className="w-fit max-w-full"
                    >
                      <SidebarMenuIcon aria-hidden="true">
                        <Avatar className="size-5 rounded-xs">
                          <AvatarImage src={organizationAvatarUrl || undefined} alt="" />
                          <AvatarFallback className="rounded-xs text-[10px]">
                            {organizationName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </SidebarMenuIcon>
                      <span className="min-w-0 truncate">{organizationName}</span>
                      <span className="-ml-1.5 flex shrink-0 text-muted-foreground group-hover/menu-button:text-foreground">
                        <HugeiconsIcon icon={ArrowDown01Icon} />
                      </span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </div>
          ) : (
            cloneElement(renderLink(homeHref), {
              className: "flex h-8 items-center px-2",
              children: <Icon />,
            } as Record<string, unknown>)
          )}
          <SidebarTrigger mode="collapse" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {backLink && (
          <SidebarGroup spacing="settingsSection">
            <SidebarGroupContent>
              <SidebarMenu>
                <NavLink
                  item={{ label: backLink.label, href: backLink.href, icon: ArrowLeft01Icon }}
                  pathname=""
                  homeHref={homeHref}
                  renderLink={renderLink}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {navGroups.map((group, index) => (
          <SidebarGroup key={group.label ?? index} spacing="settingsSection" className="py-0.5">
            {group.label && <SidebarGroupLabel className="h-7">{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    homeHref={homeHref}
                    renderLink={renderLink}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-0.5">
          <div className="min-w-0">
            <SidebarMenu>
              <SidebarMenuItem>
                {renderAccountMenu(
                  <SidebarMenuButton
                    labelOverflow="custom"
                    spacing="account"
                    type="button"
                    variant="account"
                    className="w-fit max-w-full"
                  >
                    <SidebarMenuIcon aria-hidden="true">
                      <Avatar className="size-5">
                        <AvatarImage src={userAvatarUrl || undefined} alt="" />
                        <AvatarFallback className="text-[10px]">
                          {userName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </SidebarMenuIcon>
                    <span className="min-w-0 truncate">{userName}</span>
                    <span className="-ml-1.5 flex shrink-0 text-muted-foreground group-hover/menu-button:text-foreground">
                      <HugeiconsIcon icon={MoreVerticalIcon} />
                    </span>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
          {footerAction}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
