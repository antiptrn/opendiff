import {
  type OrgRepository,
  type Repository,
  useDeleteRepoSettings,
  useOrgRepos,
  useRepositories,
  useRepositorySettings,
  useUpdateSettings,
} from "@/features/repositories";
import {
  ActiveRepoCard,
  AddRepoDialog,
  ConfigRepoDialog,
  RepoSettingsForm,
  SubscriptionWarning,
  getLastOpenedTimes,
} from "@/features/pull-requests/components";
import { Loader2, Search } from "lucide-react";
import { Button } from "opendiff-components/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "opendiff-components/components/ui/dialog";
import { Input } from "opendiff-components/components/ui/input";
import { Skeleton } from "opendiff-components/components/ui/skeleton";
import { useDebounce } from "opendiff-components/hooks";
import { useAuth } from "opendiff-shared/auth";
import { useOrganization } from "opendiff-shared/organizations";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export function RepositoriesPage() {
  const { user, logout } = useAuth();
  const { currentOrgId, currentSeat, hasSeat } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [addRepoDialogOpen, setAddRepoDialogOpen] = useState(false);
  const [configRepoDialogOpen, setConfigRepoDialogOpen] = useState(false);
  const [editingRepo, setEditingRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);
  const debouncedRepoSearch = useDebounce(repoSearchQuery, 300);

  // Use org repos from database - works for all org members regardless of GitHub access
  const { data: activatedRepos = [], isLoading: isLoadingActivated } = useOrgRepos(
    user?.access_token,
    currentOrgId,
    debouncedRepoSearch
  );

  // Sort repos by last opened time (most recent first)
  const sortedRepos = useMemo(() => {
    const lastOpenedTimes = getLastOpenedTimes();
    return [...activatedRepos].sort((a, b) => {
      const aFullName = a.fullName || `${a.owner}/${a.repo}`;
      const bFullName = b.fullName || `${b.owner}/${b.repo}`;
      const aTime = lastOpenedTimes[aFullName] || 0;
      const bTime = lastOpenedTimes[bFullName] || 0;
      return bTime - aTime;
    });
  }, [activatedRepos]);

  // Only show skeleton on initial load (no data yet), not during refetch
  const showSkeleton = isLoadingActivated && activatedRepos.length === 0;

  const { data: repositories = [], isLoading: isLoadingRepos } = useRepositories(
    user?.access_token,
    currentOrgId,
    debouncedQuery
  );

  const { data: settings, isLoading: isLoadingSettings } = useRepositorySettings(
    selectedRepo?.owner || "",
    selectedRepo?.name || ""
  );

  const { data: editSettings, isLoading: isLoadingEditSettings } = useRepositorySettings(
    editingRepo?.owner || "",
    editingRepo?.repo || ""
  );

  const updateSettings = useUpdateSettings(user?.access_token, currentOrgId);
  const deleteSettings = useDeleteRepoSettings(user?.access_token, currentOrgId);

  const handleEdit = (repo: OrgRepository) => {
    setEditingRepo({ owner: repo.owner, repo: repo.repo });
    setEditDialogOpen(true);
  };

  const handleDelete = async (repo: OrgRepository) => {
    try {
      await deleteSettings.mutateAsync({ owner: repo.owner, repo: repo.repo });
      toast.success("Repository removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove repository");
    }
  };

  const saveEditSettings = async (localSettings: {
    enabled: boolean;
    triageEnabled: boolean;
    autofixEnabled: boolean;
    sensitivity: number;
    customReviewRules: string;
  }) => {
    if (!editingRepo) return;

    try {
      await updateSettings.mutateAsync({
        owner: editingRepo.owner,
        repo: editingRepo.repo,
        enabled: localSettings.enabled,
        triageEnabled: localSettings.triageEnabled,
        autofixEnabled: localSettings.autofixEnabled,
        sensitivity: localSettings.sensitivity,
        customReviewRules: localSettings.customReviewRules,
      });
      toast.success("Settings updated");
      setEditDialogOpen(false);
      setEditingRepo(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update settings");
    }
  };

  const handleRepoSelect = (fullName: string) => {
    const repo = repositories.find((r) => r.full_name === fullName);
    if (repo) {
      setSelectedRepo(repo);
      setAddRepoDialogOpen(false);
      setConfigRepoDialogOpen(true);
    }
  };

  const saveSettings = async (localSettings: {
    enabled: boolean;
    triageEnabled: boolean;
    autofixEnabled: boolean;
    sensitivity: number;
    customReviewRules: string;
  }) => {
    if (!selectedRepo) return;

    try {
      await updateSettings.mutateAsync({
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        enabled: localSettings.enabled,
        triageEnabled: localSettings.triageEnabled,
        autofixEnabled: localSettings.autofixEnabled,
        sensitivity: localSettings.sensitivity,
        customReviewRules: localSettings.customReviewRules,
        githubRepoId: selectedRepo.id,
      });
      toast.success("Repository added");
      setConfigRepoDialogOpen(false);
      setSelectedRepo(null);
      setSearchQuery("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add repository");
    }
  };

  // Use seat tier instead of user subscription tier
  const tier = hasSeat ? currentSeat?.tier : null;
  const canEnableReviews = tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK";
  const canEnableTriage = tier === "TRIAGE" || tier === "BYOK";

  const isRepoAlreadyActive =
    selectedRepo &&
    activatedRepos.some((r) => r.owner === selectedRepo.owner && r.repo === selectedRepo.name);

  // Count paused repos for warnings
  const reviewsPausedCount = sortedRepos.filter(
    (repo) => repo.enabled && !repo.effectiveEnabled
  ).length;
  const triagePausedCount = sortedRepos.filter(
    (repo) => repo.triageEnabled && !repo.effectiveTriageEnabled
  ).length;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-medium mb-6">Repositories</h1>

      <div className="space-y-6">
        {user?.access_token && (
          <div>
            <div className="flex gap-2 mb-4">
              <div className="relative w-full max-w-120">
                <Search
                  strokeWidth={2.5}
                  className="size-4.5 absolute left-5 top-1/2 -translate-y-1/2 text-foreground"
                />
                <Input
                  className="pl-12.5 shadow-md dark:shadow-none"
                  placeholder="Search repositories..."
                  value={repoSearchQuery}
                  onChange={(e) => setRepoSearchQuery(e.target.value)}
                />
              </div>
              <Button onClick={() => setAddRepoDialogOpen(true)}>New</Button>
            </div>

            {showSkeleton && (
              <div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="py-4">
                    <Skeleton className="h-6 w-48 rounded-md" />
                  </div>
                ))}
              </div>
            )}

            {!showSkeleton && sortedRepos.length === 0 && (
              <p className="text-base text-foreground py-7 text-start">
                {debouncedRepoSearch
                  ? `No repositories matching "${debouncedRepoSearch}"`
                  : 'No repositories configured yet. Click "New" to get started.'}
              </p>
            )}

            {!showSkeleton && sortedRepos.length > 0 && (
              <div className="space-y-4">
                <SubscriptionWarning count={reviewsPausedCount} type="reviews" />
                <SubscriptionWarning count={triagePausedCount} type="triage" />

                <div className="my-6 group/repo-list">
                  {sortedRepos.map((repo) => (
                    <ActiveRepoCard
                      key={repo.fullName || `${repo.owner}/${repo.repo}`}
                      settings={repo}
                      onEdit={() => handleEdit(repo)}
                      onDelete={() => handleDelete(repo)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AddRepoDialog
        open={addRepoDialogOpen}
        onOpenChange={(open) => {
          setAddRepoDialogOpen(open);
          if (!open) {
            setSelectedRepo(null);
            setSearchQuery("");
          }
        }}
        hasAccessToken={!!user?.access_token}
        authProvider={user?.auth_provider}
        hasGithubLinked={user?.hasGithubLinked}
        onLogout={logout}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        repositories={repositories}
        activatedRepos={activatedRepos}
        isLoading={isLoadingRepos}
        debouncedQuery={debouncedQuery}
        onRepoSelect={handleRepoSelect}
      />

      <ConfigRepoDialog
        open={configRepoDialogOpen}
        onOpenChange={setConfigRepoDialogOpen}
        selectedRepo={selectedRepo}
        settings={settings}
        isLoadingSettings={isLoadingSettings}
        isRepoAlreadyActive={!!isRepoAlreadyActive}
        canEnableReviews={canEnableReviews}
        canEnableTriage={canEnableTriage}
        onSave={saveSettings}
        isSaving={updateSettings.isPending}
      />

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingRepo(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Repository</DialogTitle>
            <DialogDescription>
              Update settings for {editingRepo?.owner}/{editingRepo?.repo}.
            </DialogDescription>
          </DialogHeader>

          {isLoadingEditSettings && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {editingRepo && editSettings && !isLoadingEditSettings && (
            <RepoSettingsForm
              key={`${editingRepo.owner}/${editingRepo.repo}-${editSettings.enabled}-${editSettings.triageEnabled}-${editSettings.autofixEnabled}-${editSettings.sensitivity}-${editSettings.customReviewRules || ""}`}
              initialSettings={{
                enabled: editSettings.enabled,
                triageEnabled: editSettings.triageEnabled,
                autofixEnabled: editSettings.autofixEnabled ?? true,
                sensitivity: editSettings.sensitivity ?? 50,
                customReviewRules: editSettings.customReviewRules || "",
              }}
              canEnableReviews={canEnableReviews}
              canEnableTriage={canEnableTriage}
              onSave={saveEditSettings}
              isSaving={updateSettings.isPending}
              submitLabel="Save Settings"
              submittingLabel="Saving..."
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
