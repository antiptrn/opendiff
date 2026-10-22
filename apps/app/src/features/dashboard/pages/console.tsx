import { DashboardOverview } from "components/components/console";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { useStats } from "../hooks";

export function ConsolePage() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { data: stats, isLoading, error } = useStats(user?.access_token, currentOrgId);

  return <DashboardOverview stats={stats} isLoading={isLoading} error={error?.message} />;
}
