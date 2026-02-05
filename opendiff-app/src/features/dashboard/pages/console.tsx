import { ReviewsChart, useStats } from "@/features/dashboard";
import { Loader2 } from "lucide-react";
import { ErrorAlert } from "opendiff-components/components/ui/alert";
import { Card, CardContent } from "opendiff-components/components/ui/card";
import { useAuth } from "opendiff-shared/auth";
import { useOrganization } from "opendiff-shared/organizations";

export function ConsolePage() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { data: stats, isLoading, error } = useStats(user?.access_token, currentOrgId);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-medium mb-6">Dashboard</h1>
      <div className="grid gap-6">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && <ErrorAlert>{error.message}</ErrorAlert>}

        {stats && !isLoading && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent>
                <div className="flex flex-col items-start gap-4">
                  <div className="flex flex-col gap-3 items-start">
                    <p className="text-2xl font-medium">{stats.connectedRepos}</p>
                    <p className="text-base font-medium text-foreground">Repositories</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex flex-col items-start gap-4">
                  <div className="flex flex-col gap-3 items-start">
                    <p className="text-2xl font-medium">{stats.reviewCount}</p>
                    <p className="text-base font-medium text-foreground">Reviews Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex flex-col items-start gap-4">
                  <div className="flex flex-col gap-3 items-start">
                    <p className="text-2xl font-medium">{stats.issuesFound}</p>
                    <p className="text-base font-medium text-foreground">Issues Found</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex flex-col items-start gap-4">
                  <div className="flex flex-col gap-3 items-start">
                    <p className="text-2xl font-medium">{stats.issuesFixed}</p>
                    <p className="text-base font-medium text-foreground">Issues Fixed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!isLoading && <ReviewsChart token={user?.access_token} orgId={currentOrgId} />}
      </div>
    </div>
  );
}
