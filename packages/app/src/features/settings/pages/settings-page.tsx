import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/components/ui/tabs";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import {
  AccountTab,
  AppearanceTab,
  BillingTab,
  CodeReviewTab,
  OrganizationTab,
  SkillsTab,
} from "../components";

type TabType = "account" | "appearance" | "skills" | "code-review" | "organization" | "billing";

/**
 * Settings page - handles tab routing and renders appropriate content
 */
export function SettingsPage() {
  const { user, logout, setUser } = useAuth();
  const { currentOrgId, currentOrg, currentSeat, hasSeat } = useOrganization();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();

  // Show Organization tab for team orgs, Billing tab for personal orgs and team org owners
  const isPersonalOrg = currentOrg?.isPersonal ?? false;
  const isTeamOrgOwner = !isPersonalOrg && currentOrg?.role === "OWNER";
  const showOrganizationTab = !isPersonalOrg;
  const showBillingTab = isPersonalOrg || isTeamOrgOwner;

  // Only show Code Review tab if user has an active subscription
  const tier = hasSeat ? currentSeat?.tier : null;
  const showCodeReviewTab = !!tier;

  // Build valid tabs based on account type and subscription
  const validTabs: TabType[] = [
    "appearance",
    "account",
    "skills",
    ...(showCodeReviewTab ? ["code-review" as TabType] : []),
    ...(showOrganizationTab ? ["organization" as TabType] : []),
    ...(showBillingTab ? ["billing" as TabType] : []),
  ];

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
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          {showCodeReviewTab && <TabsTrigger value="code-review">Code Review</TabsTrigger>}
          {showOrganizationTab && <TabsTrigger value="organization">Team</TabsTrigger>}
          {showBillingTab && <TabsTrigger value="billing">Billing</TabsTrigger>}
        </TabsList>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab user={user} logout={logout} orgId={currentOrgId} setUser={setUser} />
        </TabsContent>
        <TabsContent value="skills">
          <SkillsTab user={user} />
        </TabsContent>
        {showCodeReviewTab && (
          <TabsContent value="code-review">
            <CodeReviewTab user={user} orgId={currentOrgId} />
          </TabsContent>
        )}
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
