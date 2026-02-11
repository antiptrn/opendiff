import { type ChartMetric, ReviewsChart, useStats } from "@/features/dashboard";
import { ErrorAlert } from "components/components/ui/alert";
import { Card, CardContent } from "components/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/components/ui/select";
import { Skeleton } from "components/components/ui/skeleton";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { useState } from "react";

export function ConsolePage() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { data: stats, isLoading, error } = useStats(user?.access_token, currentOrgId);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("reviews");

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Dashboard</h1>
      <div className="grid gap-6">
        {error && <ErrorAlert>{error.message}</ErrorAlert>}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <>
              {["Repositories", "Reviews Completed", "Issues Found", "Issues Fixed"].map(
                (label) => (
                  <Card key={label}>
                    <CardContent>
                      <div className="flex flex-col items-start gap-4">
                        <div className="flex flex-col gap-3 items-start">
                          <Skeleton muted className="h-6 mb-2 w-12 rounded-lg" />
                          <p className="text-base font-normal text-foreground">{label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              )}
            </>
          ) : (
            stats && (
              <>
                <Card>
                  <CardContent>
                    <div className="flex flex-col items-start gap-4">
                      <div className="flex flex-col gap-3 items-start">
                        <p className="text-2xl">{stats.connectedRepos}</p>
                        <p className="text-base font-normal text-foreground">Repositories</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <div className="flex flex-col items-start gap-4">
                      <div className="flex flex-col gap-3 items-start">
                        <p className="text-2xl">{stats.reviewCount}</p>
                        <p className="text-base font-normal text-foreground">Reviews Completed</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <div className="flex flex-col items-start gap-4">
                      <div className="flex flex-col gap-3 items-start">
                        <p className="text-2xl">{stats.issuesFound}</p>
                        <p className="text-base font-normal text-foreground">Issues Found</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <div className="flex flex-col items-start gap-4">
                      <div className="flex flex-col gap-3 items-start">
                        <p className="text-2xl">{stats.issuesFixed}</p>
                        <p className="text-base font-normal text-foreground">Issues Fixed</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )
          )}
        </div>
        <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as ChartMetric)}>
          <SelectTrigger
            size="lg"
            variant="ghost"
            className="w-fit -ml-4 -mb-2.5 !bg-transparent !ring-0 hover:text-muted-foreground"
          >
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
