import { useContext } from "react";
import { OrganizationContext } from "./organization-context";

/**
 * Hook for accessing the organization context
 * Must be used within an OrganizationProvider
 */
export function useOrganizationContext() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganizationContext must be used within OrganizationProvider");
  }
  return context;
}
