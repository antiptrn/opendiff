import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { GeneralTab, BillingTab, OrganizationTab } from "./components";

type TabType = "general" | "organization" | "billing";

/**
 * Settings page - handles tab routing and renders appropriate content
 */
export function SettingsPage() {
  const { user, logout, setUser } = useAuth();
  const { currentOrgId, currentOrg } = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();

  // Show Organization tab for team orgs, Billing tab for personal orgs
  const isPersonalOrg = currentOrg?.isPersonal ?? false;
  const showOrganizationTab = !isPersonalOrg;
  const showBillingTab = isPersonalOrg;

  // Build valid tabs based on account type
  const validTabs: TabType[] = showOrganizationTab
    ? ["general", "organization"]
    : ["general", "billing"];

  const tabParam = searchParams.get("tab") as TabType | null;
  const activeTab: TabType = tabParam && validTabs.includes(tabParam) ? tabParam : validTabs[0];

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Settings</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          {showOrganizationTab && <TabsTrigger value="organization">Team</TabsTrigger>}
          {showBillingTab && <TabsTrigger value="billing">Billing</TabsTrigger>}
        </TabsList>

        <TabsContent value="general">
          <GeneralTab user={user} logout={logout} orgId={currentOrgId} setUser={setUser} />
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
