import { ReviewsChart, useStats, type ChartMetric } from "@/features/dashboard";
import { ErrorAlert } from "opendiff-components/components/ui/alert";
import { Card, CardContent } from "opendiff-components/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "opendiff-components/components/ui/select";
import { Skeleton } from "opendiff-components/components/ui/skeleton";
import { useState } from "react";
import { useAuth } from "opendiff-shared/auth";
import { useOrganization } from "opendiff-shared/organizations";

export function ConsolePage() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { data: stats, isLoading, error } = useStats(user?.access_token, currentOrgId);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("reviews");

  return (
    <div className="p-8">
      <h1 className="text-2xl font-medium mb-6">Dashboard</h1>
      <div className="grid gap-6">
        {error && <ErrorAlert>{error.message}</ErrorAlert>}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <>
              {["Repositories", "Reviews Completed", "Issues Found", "Issues Fixed"].map((label) => (
                <Card key={label}>
                  <CardContent>
                    <div className="flex flex-col items-start gap-4">
                      <div className="flex flex-col gap-3 items-start">
                        <Skeleton muted className="h-6 mb-2 w-12 rounded-lg" />
                        <p className="text-base font-medium text-foreground">{label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : stats && (
            <>
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
            </>
          )}
        </div>
        <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as ChartMetric)}>
          <SelectTrigger variant="ghost" className="w-fit -ml-4 -mb-2.5 text-lg !bg-transparent !ring-0 hover:text-muted-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reviews">Reviews</SelectItem>
            <SelectItem value="issues">Issues</SelectItem>
            <SelectItem value="fixes">Fixes</SelectItem>
          </SelectContent>
        </Select>
        <ReviewsChart token={user?.access_token} orgId={currentOrgId} metric={chartMetric} />
      </div>
    </div>
  );
}
