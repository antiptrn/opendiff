import type { SettingsTab } from "components/components/console";
import { useOrganization } from "shared/organizations";

/**
 * Which settings categories the current organization has: Team for team orgs, Billing for
 * personal orgs and team owners. Shared by the settings page and the sidebar so they agree.
 */
export function useSettingsTabs() {
  const { currentOrg } = useOrganization();
  const isPersonalOrg = currentOrg?.isPersonal ?? false;
  const isTeamOrgOwner = !isPersonalOrg && currentOrg?.role === "OWNER";
  const showOrganization = !isPersonalOrg;
  const showBilling = isPersonalOrg || isTeamOrgOwner;

  const tabs: SettingsTab[] = [
    "appearance",
    "account",
    "skills",
    "code-review",
    ...(showOrganization ? (["organization"] as const) : []),
    ...(showBilling ? (["billing"] as const) : []),
  ];

  return { tabs, showOrganization, showBilling, isPersonalOrg };
}
