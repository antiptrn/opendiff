import { createContext, useContext, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

const CURRENT_ORG_KEY = "antiptrn_current_org";

interface OrganizationContextValue {
  selectedOrgId: string | null;
  setSelectedOrgId: (orgId: string | null) => void;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

function getStoredOrgId(): string | null {
  return localStorage.getItem(CURRENT_ORG_KEY);
}

function setStoredOrgId(orgId: string | null) {
  if (orgId) {
    localStorage.setItem(CURRENT_ORG_KEY, orgId);
  } else {
    localStorage.removeItem(CURRENT_ORG_KEY);
  }
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(getStoredOrgId);
  const queryClient = useQueryClient();

  const setSelectedOrgId = (orgId: string | null) => {
    // Remove all org-scoped cached data to ensure fresh state
    queryClient.removeQueries({ queryKey: ["organization"] });
    queryClient.removeQueries({ queryKey: ["settings"] });
    queryClient.removeQueries({ queryKey: ["stats"] });
    queryClient.removeQueries({ queryKey: ["billing"] });
    queryClient.removeQueries({ queryKey: ["subscription"] });
    queryClient.removeQueries({ queryKey: ["repos"] });
    queryClient.removeQueries({ queryKey: ["activatedRepos"] });
    queryClient.removeQueries({ queryKey: ["apiKey"] });
    queryClient.removeQueries({ queryKey: ["reviewRules"] });

    // Update state and localStorage
    setSelectedOrgIdState(orgId);
    setStoredOrgId(orgId);
  };

  return (
    <OrganizationContext.Provider value={{ selectedOrgId, setSelectedOrgId }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizationContext() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganizationContext must be used within OrganizationProvider");
  }
  return context;
}
