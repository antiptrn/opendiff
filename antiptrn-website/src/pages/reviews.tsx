import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
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
} from "@/components/ui/alert-dialog";
import { Loader2, Lock, Globe, LogIn, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import {
  useRepositories,
  useRepositorySettings,
  useUpdateSettings,
  useDeleteRepoSettings,
  useOrgRepos,
  type Repository,
  type RepositorySettings,
  type OrgRepository,
} from "@/hooks/use-api";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

// ==================== UTILITY FUNCTIONS ====================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
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

      <div className="flex items-center justify-between px-4 mb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label htmlFor={`enabled-${settings.owner}-${settings.repo}`}>Enable Reviews</Label>
            {!canEnableReviews && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                Requires Code Review plan
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Automatically review pull requests.</p>
          {!canEnableReviews && (
            <Link
              to="/pricing"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              Upgrade to enable
            </Link>
          )}
        </div>
        <Switch
          id={`enabled-${settings.owner}-${settings.repo}`}
          checked={localEnabled && canEnableReviews}
          onCheckedChange={setLocalEnabled}
          disabled={!canEnableReviews}
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between px-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label htmlFor={`triage-${settings.owner}-${settings.repo}`}>Enable Triage Mode</Label>
            {!canEnableTriage && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                Requires Triage plan
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Respond to comments and engage in discussions.
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
        <Switch
          id={`triage-${settings.owner}-${settings.repo}`}
          checked={localTriageEnabled && canEnableTriage}
          onCheckedChange={setLocalTriageEnabled}
          disabled={!canEnableTriage}
        />
      </div>

      <Separator />

      <div className="px-4 space-y-2">
        <Label htmlFor={`custom-rules-${settings.owner}-${settings.repo}`}>
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
          className="min-h-[120px] font-mono text-sm"
        />
      </div>

      <Button
        className="ml-4"
        onClick={() => onSave(localEnabled, localTriageEnabled, localCustomReviewRules)}
        disabled={isSaving}
        size="sm"
      >
        {isSaving && <Loader2 className="size-4 animate-spin" />}
        Save Settings
      </Button>
    </div>
  );
}

function ActiveRepoAccordion({
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
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <AccordionItem>
      <AccordionTrigger className="cursor-pointer">
        <div className="flex items-center gap-3">
          {settings.isPrivate ? (
            <Lock className="size-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <Globe className="size-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <span>{settings.fullName || `${settings.owner}/${settings.repo}`}</span>
          <div className="flex items-center gap-2">
            {settings.enabled && settings.effectiveEnabled && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                Reviews
              </span>
            )}
            {settings.enabled && !settings.effectiveEnabled && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                Reviews Paused
              </span>
            )}
            {settings.triageEnabled && settings.effectiveTriageEnabled && (
              <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                Triage
              </span>
            )}
            {settings.triageEnabled && !settings.effectiveTriageEnabled && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                Triage Paused
              </span>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-0">
        {/* Key resets form state when settings values change */}
        <RepoSettingsForm
          key={`${settings.owner}/${settings.repo}-${settings.enabled}-${settings.triageEnabled}-${settings.customReviewRules || ""}`}
          settings={settings}
          canEnableReviews={canEnableReviews}
          canEnableTriage={canEnableTriage}
          onSave={handleSave}
          isSaving={updateSettings.isPending}
          error={updateSettings.error?.message || deleteSettings.error?.message}
          successMessage={successMessage}
        />

        <Separator className="my-4" />

        <div className="px-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleteSettings.isPending}>
                {deleteSettings.isPending && <Loader2 className="size-4 animate-spin" />}
                <Trash2 className="size-4" />
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
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * Props for the new repository configuration form
 */
interface NewRepoConfigFormProps {
  repo: Repository;
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
  repo,
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
    <Card>
      <CardHeader>
        <CardTitle>
          Configure {repo.owner}/{repo.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="enabled">Enable Reviews</Label>
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
            <Switch
              id="enabled"
              checked={localSettings.enabled && canEnableReviews}
              onCheckedChange={(checked) =>
                setLocalSettings({ ...localSettings, enabled: checked })
              }
              disabled={!canEnableReviews}
            />
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="triage">Enable Triage Mode</Label>
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
            <Switch
              id="triage"
              checked={localSettings.triageEnabled && canEnableTriage}
              onCheckedChange={(checked) =>
                setLocalSettings({ ...localSettings, triageEnabled: checked })
              }
              disabled={!canEnableTriage}
            />
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-2">
            <Label htmlFor="custom-rules">Custom Review Rules</Label>
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
              className="min-h-[120px] font-mono text-sm"
            />
          </div>
        </div>

        <Button
          className="mt-6"
          size="sm"
          onClick={() => onSave(localSettings)}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
}

export function ReviewsPage() {
  const { user, logout } = useAuth();
  const { currentOrgId, currentSeat, hasSeat } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Use org repos from database - works for all org members regardless of GitHub access
  const { data: activatedRepos = [], isLoading: isLoadingActivated } = useOrgRepos(
    user?.access_token,
    currentOrgId
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
      setSuccessMessage(null);
    }
  };

  const saveSettings = async (localSettings: {
    enabled: boolean;
    triageEnabled: boolean;
    customReviewRules: string;
  }) => {
    if (!selectedRepo) return;

    setSuccessMessage(null);

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
        },
      });
      setSuccessMessage("Settings saved successfully");
      setSelectedRepo(null);
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
      <h1 className="text-2xl mb-6">Reviews</h1>

      <div className="space-y-6">
        {/* Add Repository Dropdown */}
        <Card>
          <CardHeader>
            <CardTitle>Add Repository</CardTitle>
            {user?.auth_provider === "google" && !user?.hasGithubLinked ? (
              <CardDescription>
                Link your GitHub account to search and add repositories. You can do this in
                Settings.
              </CardDescription>
            ) : !user?.access_token ? (
              <CardDescription>
                Please log out and log back in to grant repository access permissions.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
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
              <div className="space-y-2">
                <Combobox
                  value={selectedRepo?.full_name ?? ""}
                  onValueChange={handleRepoSelect}
                  onInputValueChange={setSearchQuery}
                >
                  <ComboboxInput
                    placeholder="Search repositories..."
                    className="w-full !bg-card !border-0 h-11 pr-2 mb-0"
                  />
                  <ComboboxContent className="p-1">
                    <ComboboxList>
                      {isLoadingRepos && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!isLoadingRepos && repositories.length === 0 && (
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                          No repositories found
                        </div>
                      )}
                      {!isLoadingRepos &&
                        repositories.map((repo) => (
                          <ComboboxItem key={repo.full_name} value={repo.full_name}>
                            {repo.private ? (
                              <Lock className="size-3.5 text-muted-foreground" />
                            ) : (
                              <Globe className="size-3.5 text-muted-foreground" />
                            )}
                            <span>{repo.full_name}</span>
                          </ComboboxItem>
                        ))}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings for newly selected repo */}
        {(settingsError || updateSettings.error) && !isRepoAlreadyActive && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {settingsError?.message || updateSettings.error?.message}
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-600 dark:text-green-400">
            {successMessage}
          </div>
        )}

        {isLoadingSettings && selectedRepo && !isRepoAlreadyActive && (
          <Card>
            <CardContent className="flex items-center justify-center py-6">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        {/* Key resets form when settings change */}
        {settings && !isLoadingSettings && selectedRepo && !isRepoAlreadyActive && (
          <NewRepoConfigForm
            key={`${selectedRepo.owner}/${selectedRepo.name}-${settings.enabled}-${settings.triageEnabled}-${settings.customReviewRules || ""}`}
            repo={selectedRepo}
            settings={settings}
            canEnableReviews={canEnableReviews}
            canEnableTriage={canEnableTriage}
            onSave={saveSettings}
            isSaving={updateSettings.isPending}
          />
        )}

        {/* Active Repositories */}
        {user?.access_token && (
          <div>
            <h2 className="text-lg mb-2">Active Repositories</h2>

            {isLoadingActivated && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border border-border rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoadingActivated && activatedRepos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No repositories configured yet. Add one above to get started.
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

                    <div className="space-y-2">
                      {activatedRepos.map((repo) => (
                        <ActiveRepoAccordion
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
    </div>
  );
}
