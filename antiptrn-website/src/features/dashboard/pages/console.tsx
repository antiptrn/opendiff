import { Card, CardContent } from "@shared/components/ui/card";
import { useStats } from "@features/dashboard";
import { useAuth } from "@features/auth";
import { useOrganization } from "@modules/organizations";
import { FolderGit2, GitPullRequest, Loader2 } from "lucide-react";

export function ConsolePage() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { data: stats, isLoading, error } = useStats(user?.access_token, currentOrgId);

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Dashboard</h1>
      <div className="grid gap-6">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error.message}
          </div>
        )}

        {stats && !isLoading && (
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent>
                <div className="flex flex-col items-start gap-4">
                  <div className="flex flex-col gap-2 items-start">
                    <p className="text-base text-muted-foreground">Reviews Completed</p>
                    <p className="text-2xl">{stats.reviewCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex flex-col items-start gap-4">
                  <div className="flex flex-col gap-2 items-start">
                    <p className="text-base text-muted-foreground">Connected Repositories</p>
                    <p className="text-2xl">{stats.connectedRepos}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
