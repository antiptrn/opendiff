import { useAuth } from "@features/auth";
import {
  useDeleteRepoSettings,
  useOrgRepos,
  useRepositories,
  useRepositorySettings,
  useUpdateSettings,
  type OrgRepository,
  type Repository,
  type RepositorySettings,
} from "@features/repositories";
import { useOrganization } from "@modules/organizations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@shared/components/ui/alert-dialog";
import { Button } from "@shared/components/ui/button";
import { Checkbox } from "@shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import { Input } from "@shared/components/ui/input";
import { Label } from "@shared/components/ui/label";
import { Skeleton } from "@shared/components/ui/skeleton";
import { Textarea } from "@shared/components/ui/textarea";
import { Loader2, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// ==================== UTILITY FUNCTIONS ====================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Language colors (subset of GitHub's language colors)
const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4F5D95",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

function getLanguageColor(language: string): string {
  return languageColors[language] || "#8b8b8b";
}

// ==================== REVIEWS TAB COMPONENTS ====================

/**
 * Props for the repository settings form
 */
interface RepoSettingsFormProps {
  settings: OrgRepository | RepositorySettings;
  canEnableReviews: boolean;
  canEnableTriage: boolean;
  onSave: (enabled: boolean, triageEnabled: boolean, customReviewRules: string) => void;
  isSaving: boolean;
  error?: string | null;
  successMessage?: string | null;
  additionalActions?: React.ReactNode;
}

/**
 * Form component for editing repository review settings
 * Note: Uses key prop pattern for state reset - parent should provide a key
 * that changes when settings change (e.g., key={settingsKey})
 */
function RepoSettingsForm({
  settings,
  canEnableReviews,
  canEnableTriage,
  onSave,
  isSaving,
  error,
  successMessage,
  additionalActions,
}: RepoSettingsFormProps) {
  // Initialize from props - use key prop on parent to reset when settings change
  const [localEnabled, setLocalEnabled] = useState(settings.enabled);
  const [localTriageEnabled, setLocalTriageEnabled] = useState(settings.triageEnabled);
  const [localCustomReviewRules, setLocalCustomReviewRules] = useState(
    settings.customReviewRules || ""
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
          {successMessage}
        </div>
      )}

      <div className="flex items-start gap-3">
        <Checkbox
          id={`enabled-${settings.owner}-${settings.repo}`}
          checked={localEnabled && canEnableReviews}
          onCheckedChange={(checked) => setLocalEnabled(checked === true)}
          disabled={!canEnableReviews}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor={`enabled-${settings.owner}-${settings.repo}`} className="text-base cursor-pointer">Enable Reviews</Label>
            {!canEnableReviews && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                Requires Code Review plan
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            When enabled, the review agent will automatically review pull requests.
          </p>
          {!canEnableReviews && (
            <Link
              to="/pricing"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              Upgrade to enable
            </Link>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-start gap-3">
        <Checkbox
          id={`triage-${settings.owner}-${settings.repo}`}
          checked={localTriageEnabled && canEnableTriage}
          onCheckedChange={(checked) => setLocalTriageEnabled(checked === true)}
          disabled={!canEnableTriage}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor={`triage-${settings.owner}-${settings.repo}`} className="text-base cursor-pointer">Enable Triage Mode</Label>
            {!canEnableTriage && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                Requires Triage plan
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            When enabled, the agent will respond to comments and engage in discussions.
          </p>
          {!canEnableTriage && (
            <Link
              to="/pricing"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              Upgrade to enable
            </Link>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-1">
        <Label htmlFor={`custom-rules-${settings.owner}-${settings.repo}`} className="text-base">
          Custom Review Rules
        </Label>
        <p className="text-sm text-muted-foreground">
          Define custom rules and guidelines for the AI to follow when reviewing code in this
          repository.
        </p>
        <Textarea
          id={`custom-rules-${settings.owner}-${settings.repo}`}
          value={localCustomReviewRules}
          onChange={(e) => setLocalCustomReviewRules(e.target.value)}
          placeholder="Example: Always check for proper error handling, prefer async/await over promises..."
          className="min-h-[120px] font-mono text-sm mt-6"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => onSave(localEnabled, localTriageEnabled, localCustomReviewRules)}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
        {additionalActions}
      </div>
    </div>
  );
}

function ActiveRepoCard({
  settings,
  canEnableReviews,
  canEnableTriage,
  token,
  orgId,
}: {
  settings: OrgRepository;
  canEnableReviews: boolean;
  canEnableTriage: boolean;
  token?: string;
  orgId?: string | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const updateSettings = useUpdateSettings(token, orgId);
  const deleteSettings = useDeleteRepoSettings(token, orgId);

  const handleSave = async (
    enabled: boolean,
    triageEnabled: boolean,
    customReviewRules: string
  ) => {
    setSuccessMessage(null);
    try {
      await updateSettings.mutateAsync({
        owner: settings.owner,
        repo: settings.repo,
        enabled,
        triageEnabled,
        customReviewRules,
        // Preserve repo metadata
        repoMetadata: {
          fullName: settings.fullName,
          description: settings.description,
          isPrivate: settings.isPrivate,
          avatarUrl: settings.avatarUrl,
          defaultBranch: settings.defaultBranch,
          htmlUrl: settings.htmlUrl,
          language: settings.language,
          pushedAt: settings.pushedAt,
        },
      });
      setSuccessMessage("Settings saved");
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSettings.mutateAsync({
        owner: settings.owner,
        repo: settings.repo,
      });
      setDialogOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <>
      <div className="py-6 border-b last:border-b-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="text-primary hover:underline truncate cursor-pointer text-left"
              >
                {settings.fullName || `${settings.owner}/${settings.repo}`}
              </button>
              <span className="inline-flex items-center text-xs border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                {settings.isPrivate ? "Private" : "Public"}
              </span>
            </div>
            {settings.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {settings.description}
              </p>
            )}
            {settings.language && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: getLanguageColor(settings.language) }}
                />
                {settings.language}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>{settings.fullName || `${settings.owner}/${settings.repo}`}</DialogTitle>
            <DialogDescription>Configure review settings for this repository.</DialogDescription>
          </DialogHeader>

          <RepoSettingsForm
            key={`${settings.owner}/${settings.repo}-${settings.enabled}-${settings.triageEnabled}-${settings.customReviewRules || ""}`}
            settings={settings}
            canEnableReviews={canEnableReviews}
            canEnableTriage={canEnableTriage}
            onSave={handleSave}
            isSaving={updateSettings.isPending}
            error={updateSettings.error?.message || deleteSettings.error?.message}
            successMessage={successMessage}
            additionalActions={
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={deleteSettings.isPending}>
                    {deleteSettings.isPending && <Loader2 className="size-4 animate-spin" />}
                    Remove Repository
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Repository</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to remove {settings.owner}/{settings.repo}? This will
                      disable all reviews and triage for this repository.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            }
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Props for the new repository configuration form
 */
interface NewRepoConfigFormProps {
  settings: RepositorySettings;
  canEnableReviews: boolean;
  canEnableTriage: boolean;
  onSave: (settings: {
    enabled: boolean;
    triageEnabled: boolean;
    customReviewRules: string;
  }) => Promise<void>;
  isSaving: boolean;
}

/**
 * Form component for configuring a newly selected repository
 * Parent uses key prop to reset state when settings change
 */
function NewRepoConfigForm({
  settings,
  canEnableReviews,
  canEnableTriage,
  onSave,
  isSaving,
}: NewRepoConfigFormProps) {
  const [localSettings, setLocalSettings] = useState({
    enabled: settings.enabled,
    triageEnabled: settings.triageEnabled,
    customReviewRules: settings.customReviewRules || "",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Checkbox
          id="enabled"
          checked={localSettings.enabled && canEnableReviews}
          onCheckedChange={(checked) =>
            setLocalSettings({ ...localSettings, enabled: checked === true })
          }
          disabled={!canEnableReviews}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="enabled" className="text-base cursor-pointer">Enable Reviews</Label>
            {!canEnableReviews && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                Requires Code Review plan
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            When enabled, the review agent will automatically review pull requests.
          </p>
          {!canEnableReviews && (
            <Link
              to="/pricing"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              Upgrade to enable
            </Link>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-start gap-3">
        <Checkbox
          id="triage"
          checked={localSettings.triageEnabled && canEnableTriage}
          onCheckedChange={(checked) =>
            setLocalSettings({ ...localSettings, triageEnabled: checked === true })
          }
          disabled={!canEnableTriage}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="triage" className="text-base cursor-pointer">Enable Triage Mode</Label>
            {!canEnableTriage && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                Requires Triage plan
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            When enabled, the agent will respond to comments and engage in discussions.
          </p>
          {!canEnableTriage && (
            <Link
              to="/pricing"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              Upgrade to enable
            </Link>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-1">
        <Label htmlFor="custom-rules" className="text-base">Custom Review Rules</Label>
        <p className="text-sm text-muted-foreground">
          Define custom rules and guidelines for the AI to follow when reviewing code in this
          repository.
        </p>
        <Textarea
          id="custom-rules"
          value={localSettings.customReviewRules}
          onChange={(e) =>
            setLocalSettings({ ...localSettings, customReviewRules: e.target.value })
          }
          placeholder="Example: Always check for proper error handling, prefer async/await over promises..."
          className="min-h-[120px] font-mono text-sm mt-6"
        />
      </div>

      <Button
        onClick={() => onSave(localSettings)}
        disabled={isSaving}
      >
        {isSaving && <Loader2 className="size-4 animate-spin" />}
        {isSaving ? "Adding..." : "Add Repository"}
      </Button>
    </div>
  );
}

export function RepositoriesPage() {
  const { user, logout } = useAuth();
  const { currentOrgId, currentSeat, hasSeat } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [addRepoDialogOpen, setAddRepoDialogOpen] = useState(false);
  const [configRepoDialogOpen, setConfigRepoDialogOpen] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);
  const debouncedRepoSearch = useDebounce(repoSearchQuery, 300);

  // Use org repos from database - works for all org members regardless of GitHub access
  const { data: activatedRepos = [], isLoading: isLoadingActivated } = useOrgRepos(
    user?.access_token,
    currentOrgId,
    debouncedRepoSearch
  );

  const { data: repositories = [], isLoading: isLoadingRepos } = useRepositories(
    user?.access_token,
    currentOrgId,
    debouncedQuery
  );

  const {
    data: settings,
    isLoading: isLoadingSettings,
    error: settingsError,
  } = useRepositorySettings(selectedRepo?.owner || "", selectedRepo?.name || "");

  const updateSettings = useUpdateSettings(user?.access_token, currentOrgId);

  const handleRepoSelect = (value: string | null) => {
    if (!value) return;
    const repo = repositories.find((r) => r.full_name === value);
    if (repo) {
      setSelectedRepo(repo);
      setAddRepoDialogOpen(false);
      setConfigRepoDialogOpen(true);
    }
  };

  const saveSettings = async (localSettings: {
    enabled: boolean;
    triageEnabled: boolean;
    customReviewRules: string;
  }) => {
    if (!selectedRepo) return;

    try {
      await updateSettings.mutateAsync({
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        enabled: localSettings.enabled,
        triageEnabled: localSettings.triageEnabled,
        customReviewRules: localSettings.customReviewRules,
        repoMetadata: {
          fullName: selectedRepo.full_name,
          isPrivate: selectedRepo.private,
          description: selectedRepo.description,
          language: selectedRepo.language,
          pushedAt: selectedRepo.pushed_at,
        },
      });
      setConfigRepoDialogOpen(false);
      setSelectedRepo(null);
      setSearchQuery("");
    } catch {
      // Error handled by mutation
    }
  };

  // Use seat tier instead of user subscription tier
  const tier = hasSeat ? currentSeat?.tier : null;
  const canEnableReviews = tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK";
  const canEnableTriage = tier === "TRIAGE" || tier === "BYOK";

  const isRepoAlreadyActive =
    selectedRepo &&
    activatedRepos.some((r) => r.owner === selectedRepo.owner && r.repo === selectedRepo.name);

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Repositories</h1>

      <div className="space-y-6">
        {/* Active Repositories */}
        {user?.access_token && (
          <div>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Find a repository..."
                value={repoSearchQuery}
                onChange={(e) => setRepoSearchQuery(e.target.value)}
                className="border border-muted focus-visible:border-sidebar-primary"
              />
              <Button onClick={() => setAddRepoDialogOpen(true)}>New</Button>
            </div>

            {isLoadingActivated && (
              <div className="border-t">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="py-6 border-b flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-5 w-14 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            )}

            {!isLoadingActivated && activatedRepos.length === 0 && (
              <p className="text-base text-muted-foreground py-10 text-center border-t">
                {debouncedRepoSearch
                  ? `No repositories matching "${debouncedRepoSearch}"`
                  : "No repositories configured yet. Click \"New\" to get started."}
              </p>
            )}

            {!isLoadingActivated &&
              activatedRepos.length > 0 &&
              (() => {
                const reviewsPausedCount = activatedRepos.filter(
                  (repo) => repo.enabled && !repo.effectiveEnabled
                ).length;
                const triagePausedCount = activatedRepos.filter(
                  (repo) => repo.triageEnabled && !repo.effectiveTriageEnabled
                ).length;

                return (
                  <div className="space-y-4">
                    {reviewsPausedCount > 0 && (
                      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                        <p className="text-amber-600 dark:text-amber-400">
                          {reviewsPausedCount === 1
                            ? "1 repository has reviews paused due to an inactive subscription."
                            : `${reviewsPausedCount} repositories have reviews paused due to an inactive subscription.`}
                        </p>
                        <Link
                          to="/pricing"
                          className="inline-flex items-center gap-1 mt-2 text-amber-700 dark:text-amber-300 hover:underline font-medium"
                        >
                          Reactivate subscription here
                        </Link>
                      </div>
                    )}

                    {triagePausedCount > 0 && (
                      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                        <p className="text-amber-600 dark:text-amber-400">
                          {triagePausedCount === 1
                            ? "1 repository has triage paused due to an inactive or insufficient subscription."
                            : `${triagePausedCount} repositories have triage paused due to an inactive or insufficient subscription.`}
                        </p>
                        <Link
                          to="/pricing"
                          className="inline-flex items-center gap-1 mt-2 text-amber-700 dark:text-amber-300 hover:underline font-medium"
                        >
                          Upgrade subscription here
                        </Link>
                      </div>
                    )}

                    <div className="border-t">
                      {activatedRepos.map((repo) => (
                        <ActiveRepoCard
                          key={`${repo.owner}/${repo.repo}`}
                          settings={repo}
                          canEnableReviews={canEnableReviews}
                          canEnableTriage={canEnableTriage}
                          token={user.access_token}
                          orgId={currentOrgId}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
          </div>
        )}
      </div>

      {/* Add Repository Dialog */}
      <Dialog
        open={addRepoDialogOpen}
        onOpenChange={(open) => {
          setAddRepoDialogOpen(open);
          if (!open) {
            setSelectedRepo(null);
            setSearchQuery("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Repository</DialogTitle>
            <DialogDescription>
              {!user?.access_token
                ? "Please log out and log back in to grant repository access permissions."
                : user?.auth_provider === "google" && !user?.hasGithubLinked
                  ? "Link your GitHub account to search and add repositories."
                  : "Search for a repository to add to your organization."}
            </DialogDescription>
          </DialogHeader>

          {!user?.access_token ? (
            <Button variant="outline" onClick={logout}>
              <LogIn className="size-4" />
              Log out to re-authenticate
            </Button>
          ) : user?.auth_provider === "google" && !user?.hasGithubLinked ? (
            <Button asChild>
              <Link to="/console/settings">Go to Settings</Link>
            </Button>
          ) : (
            <div className="space-y-3">
              <Input
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <div className="max-h-80 overflow-y-auto border rounded-lg">
                {isLoadingRepos && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!isLoadingRepos && repositories.length === 0 && (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    {debouncedQuery ? `No repositories matching "${debouncedQuery}"` : "Start typing to search..."}
                  </div>
                )}
                {!isLoadingRepos &&
                  repositories.map((repo) => {
                    const isAlreadyAdded = activatedRepos.some(
                      (r) => r.owner === repo.owner && r.repo === repo.name
                    );
                    return (
                      <button
                        key={repo.full_name}
                        type="button"
                        onClick={() => !isAlreadyAdded && handleRepoSelect(repo.full_name)}
                        disabled={isAlreadyAdded}
                        className={`w-full text-left px-3 py-3 border-b last:border-b-0 transition-colors ${isAlreadyAdded
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-muted/50 cursor-pointer"
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-primary">
                            {repo.full_name}
                          </span>
                          <span className="inline-flex items-center text-[10px] border border-border rounded-full px-1.5 py-0.5 text-muted-foreground">
                            {repo.private ? "Private" : "Public"}
                          </span>
                          {isAlreadyAdded && (
                            <span className="text-[10px] text-muted-foreground">
                              Added
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {repo.description}
                          </p>
                        )}
                        {repo.language && (
                          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: getLanguageColor(repo.language) }}
                            />
                            {repo.language}
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Configure Repository Dialog */}
      <Dialog
        open={configRepoDialogOpen}
        onOpenChange={(open) => {
          setConfigRepoDialogOpen(open);
          if (!open) {
            setSelectedRepo(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Repository</DialogTitle>
            <DialogDescription>
              Configure review settings for {selectedRepo?.full_name}.
            </DialogDescription>
          </DialogHeader>

          {(settingsError || updateSettings.error) && !isRepoAlreadyActive && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {settingsError?.message || updateSettings.error?.message}
            </div>
          )}

          {isRepoAlreadyActive && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
              This repository is already added to your organization.
            </div>
          )}

          {isLoadingSettings && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {selectedRepo && settings && !isLoadingSettings && !isRepoAlreadyActive && (
            <NewRepoConfigForm
              key={`${selectedRepo.owner}/${selectedRepo.name}-${settings.enabled}-${settings.triageEnabled}-${settings.customReviewRules || ""}`}
              settings={settings}
              canEnableReviews={canEnableReviews}
              canEnableTriage={canEnableTriage}
              onSave={saveSettings}
              isSaving={updateSettings.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
