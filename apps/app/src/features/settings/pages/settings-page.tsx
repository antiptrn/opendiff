import { PageTitle, SETTINGS_HREF, type SettingsTab } from "components/components/console";
import { Navigate, useParams } from "react-router-dom";
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
import { useSettingsTabs } from "../hooks";

const TAB_HEADERS: Record<SettingsTab, { title: string; description: string }> = {
  appearance: { title: "Appearance", description: "Customize how Contrast looks on your device" },
  account: { title: "Account", description: "Manage your account and connected services" },
  skills: { title: "Skills", description: "Instructions the review agent follows on your code" },
  "code-review": {
    title: "Code Review",
    description: "Set up and tune reviews on your repositories",
  },
  organization: { title: "Team", description: "Manage your team, its members and invites" },
  billing: { title: "Billing", description: "Manage your plan, seats and invoices" },
};

/**
 * Settings page: shows the category picked in the sidebar. An unknown or missing category goes
 * to the first one available.
 */
export function SettingsPage() {
  const { user, logout, setUser } = useAuth();
  const { currentOrgId } = useOrganization();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const { tabs, isPersonalOrg } = useSettingsTabs();

  const activeTab = tabs.find((tab) => tab === tabParam);
  if (!activeTab) return <Navigate to={`${SETTINGS_HREF}/${tabs[0]}`} replace />;

  return (
    <div className="max-w-3xl p-8">
      <PageTitle description={TAB_HEADERS[activeTab].description}>
        {TAB_HEADERS[activeTab].title}
      </PageTitle>

      {activeTab === "appearance" && <AppearanceTab />}
      {activeTab === "account" && (
        <AccountTab user={user} logout={logout} orgId={currentOrgId} setUser={setUser} />
      )}
      {activeTab === "skills" && <SkillsTab user={user} />}
      {activeTab === "code-review" && <CodeReviewTab user={user} orgId={currentOrgId} />}
      {activeTab === "organization" && <OrganizationTab user={user} orgId={currentOrgId} />}
      {activeTab === "billing" && (
        <BillingTab user={user} orgId={currentOrgId} isSoloUser={isPersonalOrg} />
      )}
    </div>
  );
}
