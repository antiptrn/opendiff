import { useParams, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/components/ui/tabs";
import { useAuth } from "@features/auth";
import { useOrganization } from "@modules/organizations";
import { AccountTab, CodeReviewTab, BillingTab, OrganizationTab } from "../components";

type TabType = "account" | "code-review" | "organization" | "billing";

/**
 * Settings page - handles tab routing and renders appropriate content
 */
export function SettingsPage() {
  const { user, logout, setUser } = useAuth();
  const { currentOrgId, currentOrg } = useOrganization();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();

  // Show Organization tab for team orgs, Billing tab for personal orgs and team org owners
  const isPersonalOrg = currentOrg?.isPersonal ?? false;
  const isTeamOrgOwner = !isPersonalOrg && currentOrg?.role === "OWNER";
  const showOrganizationTab = !isPersonalOrg;
  const showBillingTab = isPersonalOrg || isTeamOrgOwner;

  // Build valid tabs based on account type
  const validTabs: TabType[] = showOrganizationTab
    ? showBillingTab
      ? ["account", "code-review", "organization", "billing"]
      : ["account", "code-review", "organization"]
    : ["account", "code-review", "billing"];

  const activeTab: TabType =
    tabParam && validTabs.includes(tabParam as TabType) ? (tabParam as TabType) : validTabs[0];

  const setActiveTab = (tab: string) => {
    navigate(`/console/settings/${tab}`, { replace: true });
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Settings</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="code-review">Code Review</TabsTrigger>
          {showOrganizationTab && <TabsTrigger value="organization">Team</TabsTrigger>}
          {showBillingTab && <TabsTrigger value="billing">Billing</TabsTrigger>}
        </TabsList>

        <TabsContent value="account">
          <AccountTab user={user} logout={logout} orgId={currentOrgId} setUser={setUser} />
        </TabsContent>
        <TabsContent value="code-review">
          <CodeReviewTab user={user} orgId={currentOrgId} />
        </TabsContent>
        {showOrganizationTab && (
          <TabsContent value="organization">
            <OrganizationTab user={user} orgId={currentOrgId} />
          </TabsContent>
        )}
        {showBillingTab && (
          <TabsContent value="billing">
            <BillingTab user={user} orgId={currentOrgId} isSoloUser={isPersonalOrg} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
