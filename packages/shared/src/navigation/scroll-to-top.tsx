import { useEffect } from "react";
import { useLocation } from "react-router-dom";

interface NavigationScrollToTopProps {
  getContainer?: () => HTMLElement | null;
}

/** Scrolls to top whenever route path or query changes. */
export function NavigationScrollToTop({ getContainer }: NavigationScrollToTopProps) {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      return;
    }

    const container = getContainer?.();
    if (container) {
      container.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [getContainer, location.hash, location.pathname, location.search]);

  return null;
}
