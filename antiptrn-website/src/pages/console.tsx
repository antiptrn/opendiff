import { Card, CardContent } from "@/components/ui/card";
import { useStats } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
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
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                    <GitPullRequest className="size-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reviews Completed</p>
                    <p className="text-2xl">{stats.reviewCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-green-500/10">
                    <FolderGit2 className="size-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Connected Repositories</p>
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
