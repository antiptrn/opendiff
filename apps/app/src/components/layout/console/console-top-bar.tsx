import {
  type AppSidebarNavGroup,
  buildConsoleCrumbs,
  ConsoleTopBar as SharedConsoleTopBar,
} from "components/components/console";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

interface TopBarState {
  trail?: string;
  setTrail: (trail: string | undefined) => void;
  /** Element at the right of the bar that pages render their actions into */
  actionsNode: HTMLElement | null;
  setActionsNode: (node: HTMLElement | null) => void;
  /** Element at the right of the bar, before the actions, that pages render their search into */
  searchNode: HTMLElement | null;
  setSearchNode: (node: HTMLElement | null) => void;
}

const TopBarContext = createContext<TopBarState | null>(null);

/** Lets console pages put a trailing breadcrumb and actions in the top bar */
export function ConsoleTopBarProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<string>();
  const [actionsNode, setActionsNode] = useState<HTMLElement | null>(null);
  const [searchNode, setSearchNode] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ trail, setTrail, actionsNode, setActionsNode, searchNode, setSearchNode }),
    [trail, actionsNode, searchNode]
  );
  return <TopBarContext.Provider value={value}>{children}</TopBarContext.Provider>;
}

/** Adds a last breadcrumb after the page's own, such as a pull request number, while shown */
export function useConsoleBreadcrumb(trail: string | undefined) {
  const setTrail = useContext(TopBarContext)?.setTrail;
  useEffect(() => {
    setTrail?.(trail);
    return () => setTrail?.(undefined);
  }, [setTrail, trail]);
}

/** Renders its children at the right of the top bar, before the actions, such as a TopBarSearch */
export function ConsoleTopBarSearch({ children }: { children: ReactNode }) {
  const node = useContext(TopBarContext)?.searchNode;
  return node ? createPortal(children, node) : null;
}

/** Renders its children at the right of the top bar, such as an "Connect Repository" button */
export function ConsoleTopBarActions({ children }: { children: ReactNode }) {
  const node = useContext(TopBarContext)?.actionsNode;
  return node ? createPortal(children, node) : null;
}

/** The shared console top bar, with the breadcrumb for the current route and the pages' actions */
export function ConsoleTopBar({
  navGroups,
  settingsHref,
  pathname,
}: {
  navGroups: AppSidebarNavGroup[];
  settingsHref: string;
  pathname: string;
}) {
  const context = useContext(TopBarContext);
  const trail = context?.trail;
  const crumbs = useMemo(
    () => buildConsoleCrumbs(pathname, navGroups, settingsHref, trail),
    [pathname, navGroups, settingsHref, trail]
  );

  return (
    <SharedConsoleTopBar
      crumbs={crumbs}
      renderLink={(href) => <Link to={href} />}
      actionsRef={context?.setActionsNode}
      searchRef={context?.setSearchNode}
    />
  );
}
