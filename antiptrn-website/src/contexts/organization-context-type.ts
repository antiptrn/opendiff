import { createContext } from "react";

/**
 * Value type for the organization context
 */
export interface OrganizationContextValue {
  /** Currently selected organization ID */
  selectedOrgId: string | null;
  /** Function to update the selected organization ID */
  setSelectedOrgId: (orgId: string | null) => void;
}

/**
 * Context for organization state management
 */
export const OrganizationContext = createContext<OrganizationContextValue | null>(null);
