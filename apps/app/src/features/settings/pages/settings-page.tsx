import { SETTINGS_HREF, type SettingsTab } from "components/components/console";
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

/** One line under the breadcrumb describing each settings category */
const TAB_DESCRIPTIONS: Record<SettingsTab, string> = {
  appearance: "Customize how Contrast looks on your device",
  account: "Manage your account and connected services",
  skills: "Instructions the review agent follows on your code",
  "code-review": "Set up and tune reviews on your repositories",
  organization: "Manage your team, its members and invites",
  billing: "Manage your plan, seats and invoices",
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
    <div className="w-full py-4">
      <div>
        {/* Sections set their own width, so a table section can run side to side */}
        <p className="mb-5 max-w-3xl px-4 text-base text-muted-foreground">
          {TAB_DESCRIPTIONS[activeTab]}
        </p>

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
    </div>
  );
}
