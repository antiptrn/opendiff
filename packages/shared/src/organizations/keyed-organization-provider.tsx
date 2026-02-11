import type { ReactNode } from "react";
import { useAuth } from "../auth";
import { OrganizationProvider } from "./context";

/** Reads active account ID from localStorage to avoid React state timing issues on initial render. */
function getActiveAccountId(): string {
  try {
    const stored = localStorage.getItem("opendiff_accounts");
    if (stored) {
      const data = JSON.parse(stored);
      return data.activeAccountId || "anonymous";
    }
  } catch {
    // ignore
  }
  return "anonymous";
}

/** Wrapper that keys OrganizationProvider by user ID so it remounts on account switch. */
export function KeyedOrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.visitorId ?? user?.id ?? getActiveAccountId();
  return <OrganizationProvider key={userId}>{children}</OrganizationProvider>;
}
