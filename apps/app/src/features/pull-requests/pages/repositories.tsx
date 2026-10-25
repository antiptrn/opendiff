import { Loading03Icon } from "@hugeicons/core-free-icons";
import { TableEmpty } from "@/components/paginated-table";
import {
  AddRepoDialog,
  ConfigRepoDialog,
  RepoSettingsForm,
  RepoTable,
} from "@/features/pull-requests/components";
import { ConsoleTopBarSearch } from "@/components/layout/console";
import { RepositoryIcon } from "@hugeicons/core-free-icons";
import {
  FilterPopover,
  ListHeader,
  ListTab,
  SortMenu,
  TopBarSearch,
} from "components/components/console";
import {
  type OrgRepository,
  type Repository,
  useDeleteRepoSettings,
  useOrgRepos,
  useReviewOpenPulls,
  useRepositories,
  useRepositorySettings,
  useUpdateSettings,
} from "@/features/repositories";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "components/components/ui/button";
import { Checkbox } from "components/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "components/components/ui/sheet";
import { useDebounce } from "components/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { queryKeys } from "shared/services";
import { toast } from "sonner";

type RepoTypeFilter = "all" | "public" | "private";
type RepoSort = "pushed" | "name";

const SORT_OPTIONS: { value: RepoSort; label: string }[] = [
  { value: "pushed", label: "Last pushed" },
  { value: "name", label: "Name" },
];

const repoFullName = (repo: OrgRepository) => repo.fullName || `${repo.owner}/${repo.repo}`;

export function RepositoriesPage() {
  const { user, logout } = useAuth();
  const { currentOrgId } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [repoType, setRepoType] = useState<RepoTypeFilter>("all");
  const [repoLanguages, setRepoLanguages] = useState<string[]>([]);
  const [repoSort, setRepoSort] = useState<RepoSort>("pushed");
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [addRepoDialogOpen, setAddRepoDialogOpen] = useState(false);
  const [configRepoDialogOpen, setConfigRepoDialogOpen] = useState(false);
  const [editingRepo, setEditingRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const typedQuery = useDebounce(searchQuery, 300);
  const queryClient = useQueryClient();
  // A query we already have results for (such as clearing back to an empty search) runs straight
  // away from the cache; only new queries wait for typing to pause
  const hasCachedResults =
    queryClient.getQueryData(queryKeys.repos(currentOrgId, searchQuery)) !== undefined;
  const debouncedQuery = hasCachedResults ? searchQuery : typedQuery;
  const debouncedRepoSearch = useDebounce(repoSearchQuery, 300);

  // Use org repos from database - works for all org members regardless of GitHub access
  const { data: activatedRepos = [], isLoading: isLoadingActivated } = useOrgRepos(
    user?.access_token,
    currentOrgId,
    debouncedRepoSearch
  );

  // The languages the connected repositories use, for the Language menu
  const languageOptions = useMemo(
    () =>
      [
        ...new Set(activatedRepos.map((repo) => repo.language).filter((name) => name !== null)),
      ].sort(),
    [activatedRepos]
  );

  // Narrowed by the Language menu (which the tab counts follow too), then by the tab, then ordered
  // by the Sort menu (last pushed by default)
  const languageFiltered = useMemo(
    () =>
      activatedRepos.filter(
        (repo) =>
          repoLanguages.length === 0 || (!!repo.language && repoLanguages.includes(repo.language))
      ),
    [activatedRepos, repoLanguages]
  );
  const typeCounts = {
    all: languageFiltered.length,
    public: languageFiltered.filter((repo) => !repo.isPrivate).length,
    private: languageFiltered.filter((repo) => repo.isPrivate).length,
  };
  const sortedRepos = useMemo(() => {
    const nameOf = (repo: OrgRepository) => repo.fullName || `${repo.owner}/${repo.repo}`;
    return languageFiltered
      .filter((repo) => repoType === "all" || repo.isPrivate === (repoType === "private"))
      .sort((a, b) => {
        if (repoSort === "name") return nameOf(a).localeCompare(nameOf(b));
        return (
          (b.pushedAt ? Date.parse(b.pushedAt) : 0) - (a.pushedAt ? Date.parse(a.pushedAt) : 0)
        );
      });
  }, [languageFiltered, repoType, repoSort]);
  // Only rows still shown count as selected, so changing a filter can't leave hidden ones ticked
  const selectedShown = sortedRepos.filter((repo) => selectedRepos.has(repoFullName(repo))).length;
  const isFiltered = !!debouncedRepoSearch || repoType !== "all" || repoLanguages.length > 0;

  const {
    data: repositories = [],
    isLoading: isLoadingRepos,
    isFetching: isFetchingRepos,
  } = useRepositories(user?.access_token, currentOrgId, debouncedQuery);

  const { data: settings, isLoading: isLoadingSettings } = useRepositorySettings(
    selectedRepo?.owner || "",
    selectedRepo?.name || "",
    user?.access_token,
    currentOrgId
  );

  const { data: editSettings, isLoading: isLoadingEditSettings } = useRepositorySettings(
    editingRepo?.owner || "",
    editingRepo?.repo || "",
    user?.access_token,
    currentOrgId
  );

  const updateSettings = useUpdateSettings(user?.access_token, currentOrgId);
  const deleteSettings = useDeleteRepoSettings(user?.access_token, currentOrgId);
  const reviewOpenPullsMutation = useReviewOpenPulls(user?.access_token, currentOrgId);

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
    approveEnabled: boolean;
    reviewIncludedDirs: string;
    reviewIgnoredDirs: string;
    autofixEnabled: boolean;
    autofixIncludedDirs: string;
    autofixIgnoredDirs: string;
    sensitivity: number;
    customReviewRules: string;
  }) => {
    if (!editingRepo) return;

    try {
      await updateSettings.mutateAsync({
        owner: editingRepo.owner,
        repo: editingRepo.repo,
        enabled: localSettings.enabled,
        approveEnabled: localSettings.approveEnabled,
        reviewIncludedDirs: localSettings.reviewIncludedDirs,
        reviewIgnoredDirs: localSettings.reviewIgnoredDirs,
        autofixEnabled: localSettings.autofixEnabled,
        autofixIncludedDirs: localSettings.autofixIncludedDirs,
        autofixIgnoredDirs: localSettings.autofixIgnoredDirs,
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

  const saveSettings = async (
    localSettings: {
      enabled: boolean;
      approveEnabled: boolean;
      reviewIncludedDirs: string;
      reviewIgnoredDirs: string;
      autofixEnabled: boolean;
      autofixIncludedDirs: string;
      autofixIgnoredDirs: string;
      sensitivity: number;
      customReviewRules: string;
    },
    { reviewOpenPulls }: { reviewOpenPulls: boolean }
  ) => {
    if (!selectedRepo) return;

    try {
      await updateSettings.mutateAsync({
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        enabled: localSettings.enabled,
        approveEnabled: localSettings.approveEnabled,
        reviewIncludedDirs: localSettings.reviewIncludedDirs,
        reviewIgnoredDirs: localSettings.reviewIgnoredDirs,
        autofixEnabled: localSettings.autofixEnabled,
        autofixIncludedDirs: localSettings.autofixIncludedDirs,
        autofixIgnoredDirs: localSettings.autofixIgnoredDirs,
        sensitivity: localSettings.sensitivity,
        customReviewRules: localSettings.customReviewRules,
        githubRepoId: selectedRepo.id,
      });
      toast.success("Repository added");
      if (reviewOpenPulls && localSettings.enabled) {
        // The repository is connected either way; this only reports how the backlog went
        reviewOpenPullsMutation
          .mutateAsync({ owner: selectedRepo.owner, repo: selectedRepo.name })
          .then(({ queued }) =>
            toast.success(
              queued === 0
                ? "No open pull requests to review"
                : `Reviewing ${queued} open pull request${queued === 1 ? "" : "s"}`
            )
          )
          .catch((error) =>
            toast.error(
              error instanceof Error
                ? error.message
                : "Couldn't start reviews for open pull requests"
            )
          );
      }
      setConfigRepoDialogOpen(false);
      setSelectedRepo(null);
      setSearchQuery("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect repository");
    }
  };

  const isRepoAlreadyActive =
    selectedRepo &&
    activatedRepos.some((r) => r.owner === selectedRepo.owner && r.repo === selectedRepo.name);

  // With nothing connected the empty state offers its own connect button, so the top bar's isn't needed
  const showsEmptyState =
    !!user?.access_token && !isLoadingActivated && activatedRepos.length === 0 && !isFiltered;

  return (
    <div className="flex flex-1 flex-col">
      {user?.access_token && (
        <>
          <ConsoleTopBarSearch>
            <TopBarSearch
              shortcut="f"
              placeholder="Search repositories"
              value={repoSearchQuery}
              onChange={(event) => setRepoSearchQuery(event.target.value)}
            />
          </ConsoleTopBarSearch>

          <div className="flex w-full flex-1 flex-col p-4">
            {isLoadingActivated && activatedRepos.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-12" role="status">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  className="size-6 animate-spin text-muted-foreground"
                />
                <span className="sr-only">Loading repositories…</span>
              </div>
            ) : showsEmptyState ? (
              <TableEmpty
                title="No repositories yet"
                description="Connect a repository to start reviewing its pull requests."
                action={
                  <Button size="sm" onClick={() => setAddRepoDialogOpen(true)}>
                    Connect repository
                  </Button>
                }
              />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border-solid">
                {/* Header: visibility tabs, then the language filter and sort menus */}
                <ListHeader>
                  <Checkbox
                    aria-label="Select all repositories"
                    className="mr-1"
                    disabled={sortedRepos.length === 0}
                    checked={
                      selectedShown === sortedRepos.length && sortedRepos.length > 0
                        ? true
                        : selectedShown > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() =>
                      setSelectedRepos(
                        selectedShown === sortedRepos.length
                          ? new Set()
                          : new Set(sortedRepos.map(repoFullName))
                      )
                    }
                  />
                  {selectedShown > 0 ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span>{selectedShown} selected</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => setSelectedRepos(new Set())}
                      >
                        Clear
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <ListTab
                        label="All"
                        count={typeCounts.all}
                        active={repoType === "all"}
                        onClick={() => setRepoType("all")}
                      />
                      <ListTab
                        label="Public"
                        count={typeCounts.public}
                        active={repoType === "public"}
                        onClick={() => setRepoType("public")}
                      />
                      <ListTab
                        label="Private"
                        count={typeCounts.private}
                        active={repoType === "private"}
                        onClick={() => setRepoType("private")}
                      />
                    </div>
                  )}
                  <div className="ml-auto flex flex-wrap items-center">
                    <FilterPopover
                      label="Language"
                      title="Filter by language"
                      options={languageOptions}
                      selected={repoLanguages}
                      onChange={setRepoLanguages}
                    />
                    <SortMenu value={repoSort} options={SORT_OPTIONS} onChange={setRepoSort} />
                    {/* Extra space before it: the menus beside it have no fill, so they look further apart */}
                    <Button
                      size="sm"
                      className="ml-2"
                      aria-label="Connect a repository"
                      onClick={() => setAddRepoDialogOpen(true)}
                    >
                      <HugeiconsIcon
                        icon={RepositoryIcon}
                        data-icon="inline-start"
                        className="size-3.5"
                      />
                      New
                    </Button>
                  </div>
                </ListHeader>

                {sortedRepos.length === 0 ? (
                  <TableEmpty
                    variant="plain"
                    title="No matching repositories"
                    description={
                      debouncedRepoSearch
                        ? `Nothing matches "${debouncedRepoSearch}".`
                        : "No repositories match these filters."
                    }
                  />
                ) : (
                  <RepoTable
                    repos={sortedRepos}
                    selected={selectedRepos}
                    onSelectedChange={(fullName, isSelected) =>
                      setSelectedRepos((previous) => {
                        const next = new Set(previous);
                        if (isSelected) next.add(fullName);
                        else next.delete(fullName);
                        return next;
                      })
                    }
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}

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
        // Previous results stay up while a new search loads, so also count the fetch and the
        // debounce wait as searching; a query with cached results shows them without a spinner
        isLoading={
          !hasCachedResults && (isLoadingRepos || isFetchingRepos || searchQuery !== debouncedQuery)
        }
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
        onSave={saveSettings}
        isSaving={updateSettings.isPending}
      />

      {/* A repository's settings open in a side sheet, so the list stays in view */}
      <Sheet
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingRepo(null);
        }}
      >
        <SheetContent className="gap-0 bg-background data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          <SheetHeader className="border-b border-border-solid pr-12">
            <SheetTitle>
              {editingRepo?.owner}/{editingRepo?.repo}
            </SheetTitle>
            <SheetDescription>Review and auto-fix settings for this repository.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingEditSettings && (
              <div className="flex items-center justify-center py-6">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  className="size-6 animate-spin text-muted-foreground"
                />
              </div>
            )}

            {editingRepo && editSettings && !isLoadingEditSettings && (
              <RepoSettingsForm
                key={`${editingRepo.owner}/${editingRepo.repo}-${editSettings.enabled}-${editSettings.approveEnabled}-${editSettings.reviewIncludedDirs || ""}-${editSettings.reviewIgnoredDirs || ""}-${editSettings.autofixEnabled}-${editSettings.autofixIncludedDirs || ""}-${editSettings.autofixIgnoredDirs || ""}-${editSettings.sensitivity}-${editSettings.customReviewRules || ""}`}
                initialSettings={{
                  enabled: editSettings.enabled,
                  approveEnabled: editSettings.approveEnabled ?? false,
                  reviewIncludedDirs: editSettings.reviewIncludedDirs || "",
                  reviewIgnoredDirs: editSettings.reviewIgnoredDirs || "",
                  autofixEnabled: editSettings.autofixEnabled ?? true,
                  autofixIncludedDirs: editSettings.autofixIncludedDirs || "",
                  autofixIgnoredDirs: editSettings.autofixIgnoredDirs || "",
                  sensitivity: editSettings.sensitivity ?? 50,
                  customReviewRules: editSettings.customReviewRules || "",
                }}
                onSave={saveEditSettings}
                isSaving={updateSettings.isPending}
                submitLabel="Save Settings"
                submittingLabel="Saving..."
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
