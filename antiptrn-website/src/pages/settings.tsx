import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Loader2, Lock, Globe, LogIn, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  useRepositories,
  useRepositorySettings,
  useUpdateSettings,
  useActivatedRepos,
  useApiKeyStatus,
  useUpdateApiKey,
  useDeleteApiKey,
  useReviewRules,
  useUpdateReviewRules,
  type Repository,
  type RepositorySettings,
} from "@/hooks/use-api";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { Separator } from "@/components/ui/separator";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function RepoSettingsForm({
  settings,
  canEnableReviews,
  canEnableTriage,
  onSave,
  isSaving,
  error,
  successMessage,
}: {
  settings: RepositorySettings;
  canEnableReviews: boolean;
  canEnableTriage: boolean;
  onSave: (enabled: boolean, triageEnabled: boolean) => void;
  isSaving: boolean;
  error?: string | null;
  successMessage?: string | null;
}) {
  const [localEnabled, setLocalEnabled] = useState(settings.enabled);
  const [localTriageEnabled, setLocalTriageEnabled] = useState(settings.triageEnabled);

  useEffect(() => {
    setLocalEnabled(settings.enabled);
    setLocalTriageEnabled(settings.triageEnabled);
  }, [settings]);

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
          <p className="text-sm text-muted-foreground">
            Automatically review pull requests.
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

      <Button
        className="ml-4"
        onClick={() => onSave(localEnabled, localTriageEnabled)}
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
}: {
  settings: RepositorySettings;
  canEnableReviews: boolean;
  canEnableTriage: boolean;
  token?: string;
}) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const updateSettings = useUpdateSettings(token);

  const handleSave = async (enabled: boolean, triageEnabled: boolean) => {
    setSuccessMessage(null);
    try {
      await updateSettings.mutateAsync({
        owner: settings.owner,
        repo: settings.repo,
        enabled,
        triageEnabled,
      });
      setSuccessMessage("Settings saved");
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <AccordionItem>
      <AccordionTrigger className="cursor-pointer">
        <div className="flex items-center gap-3">
          <span>{settings.owner}/{settings.repo}</span>
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
        <RepoSettingsForm
          settings={settings}
          canEnableReviews={canEnableReviews}
          canEnableTriage={canEnableTriage}
          onSave={handleSave}
          isSaving={updateSettings.isPending}
          error={updateSettings.error?.message}
          successMessage={successMessage}
        />
      </AccordionContent>
    </AccordionItem>
  );
}

function ApiKeyCard({ token }: { token?: string }) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showInput, setShowInput] = useState(false);

  const { data: apiKeyStatus, isLoading } = useApiKeyStatus(token);
  const updateApiKey = useUpdateApiKey(token);
  const deleteApiKey = useDeleteApiKey(token);

  const handleSave = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      await updateApiKey.mutateAsync(apiKeyInput);
      setApiKeyInput("");
      setShowInput(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    try {
      await deleteApiKey.mutateAsync();
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Anthropic API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anthropic API Key</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your BYOK plan requires your own Anthropic API key. You pay Anthropic directly for API usage.
        </p>

        {(updateApiKey.error || deleteApiKey.error) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {updateApiKey.error?.message || deleteApiKey.error?.message}
          </div>
        )}

        {apiKeyStatus?.hasKey && !showInput ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded text-sm">
                {apiKeyStatus.maskedKey}
              </code>
              <span className="text-sm text-green-600 dark:text-green-400">Configured</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowInput(true)}
              >
                Update Key
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteApiKey.isPending}
              >
                {deleteApiKey.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                Remove Key
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-ant-..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="font-mono"
              />
              <Button
                onClick={handleSave}
                disabled={!apiKeyInput.trim() || updateApiKey.isPending}
              >
                {updateApiKey.isPending && <Loader2 className="size-4 animate-spin" />}
                {updateApiKey.isPending ? "Saving..." : "Save"}
              </Button>
              {showInput && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowInput(false);
                    setApiKeyInput("");
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Get your API key from{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CustomReviewRulesCard({ token }: { token?: string }) {
  const [localRules, setLocalRules] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: rulesData, isLoading } = useReviewRules(token);
  const updateRules = useUpdateReviewRules(token);

  useEffect(() => {
    if (rulesData?.rules !== undefined) {
      setLocalRules(rulesData.rules);
    }
  }, [rulesData?.rules]);

  const handleSave = async () => {
    setSuccessMessage(null);
    try {
      await updateRules.mutateAsync(localRules);
      setSuccessMessage("Review rules saved");
    } catch {
      // Error handled by mutation
    }
  };

  const hasChanges = rulesData?.rules !== localRules;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Custom Review Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Review Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Define custom rules and guidelines for the AI to follow when reviewing your code. These rules will be included in every review.
        </p>

        {updateRules.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {updateRules.error?.message}
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
            {successMessage}
          </div>
        )}

        <Textarea
          placeholder="Example rules:&#10;- Always check for proper error handling&#10;- Flag any hardcoded credentials&#10;- Ensure functions have proper TypeScript types&#10;- Check for accessibility issues in React components"
          value={localRules}
          onChange={(e) => setLocalRules(e.target.value)}
          className="min-h-[150px] font-mono text-sm"
          maxLength={5000}
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {localRules.length}/5000 characters
          </p>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateRules.isPending}
          >
            {updateRules.isPending && <Loader2 className="size-4 animate-spin" />}
            {updateRules.isPending ? "Saving..." : "Save Rules"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [localSettings, setLocalSettings] = useState<{
    enabled: boolean;
    triageEnabled: boolean;
  } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Fetch activated repos
  const {
    data: activatedRepos = [],
    isLoading: isLoadingActivated,
  } = useActivatedRepos(user?.access_token);

  // Fetch repositories with debounced search
  const {
    data: repositories = [],
    isLoading: isLoadingRepos,
  } = useRepositories(user?.access_token, debouncedQuery);

  // Fetch settings for selected repo
  const {
    data: settings,
    isLoading: isLoadingSettings,
    error: settingsError,
  } = useRepositorySettings(
    selectedRepo?.owner || "",
    selectedRepo?.name || ""
  );

  // Update settings mutation
  const updateSettings = useUpdateSettings(user?.access_token);

  // Sync local settings when fetched settings change
  useEffect(() => {
    if (settings) {
      setLocalSettings({
        enabled: settings.enabled,
        triageEnabled: settings.triageEnabled,
      });
    }
  }, [settings]);

  const handleRepoSelect = (value: string | null) => {
    if (!value) return;
    const repo = repositories.find((r) => r.full_name === value);
    if (repo) {
      setSelectedRepo(repo);
      setLocalSettings(null);
      setSuccessMessage(null);
    }
  };

  const saveSettings = async () => {
    if (!selectedRepo || !localSettings) return;

    setSuccessMessage(null);

    try {
      await updateSettings.mutateAsync({
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        enabled: localSettings.enabled,
        triageEnabled: localSettings.triageEnabled,
      });
      setSuccessMessage("Settings saved successfully");
      // Clear selection after saving so it appears in the active list
      setSelectedRepo(null);
      setLocalSettings(null);
    } catch {
      // Error handled by mutation
    }
  };

  const tier = user?.subscriptionTier || "FREE";
  const canEnableReviews = tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK";
  const canEnableTriage = tier === "TRIAGE" || tier === "BYOK";

  // Check if selected repo is already in activated list
  const isRepoAlreadyActive = selectedRepo && activatedRepos.some(
    (r) => r.owner === selectedRepo.owner && r.repo === selectedRepo.name
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Repository Settings</h1>

      <div className="max-w-2xl space-y-6">
        {/* Install GitHub App */}
        <Card>
          <CardHeader>
            <CardTitle>Install GitHub App</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Install the GitHub App on your repositories to enable code reviews. You can install it on your personal account or any organization you have access to.
            </p>
            <Button asChild>
              <a
                href="https://github.com/apps/antiptrn-review-agent/installations/new"
                target="_blank"
                rel="noopener noreferrer"
              >
                Install GitHub App
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* BYOK API Key Card */}
        {tier === "BYOK" && <ApiKeyCard token={user?.access_token} />}

        {/* Custom Review Rules - available for all paid plans */}
        {tier !== "FREE" && <CustomReviewRulesCard token={user?.access_token} />}

        {/* Add Repository Dropdown */}
        <Card>
          <CardHeader>
            <CardTitle>
              Add Repository
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!user?.access_token ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Please log out and log back in to grant repository access permissions.
                </p>
                <Button variant="outline" onClick={logout}>
                  <LogIn className="size-4 mr-2" />
                  Log out to re-authenticate
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Combobox
                  value={selectedRepo?.full_name ?? ""}
                  onValueChange={handleRepoSelect}
                  onInputValueChange={setSearchQuery}
                >
                  <ComboboxInput
                    placeholder="Search repositories..."
                    className="w-full"
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
                      {!isLoadingRepos && repositories.map((repo) => (
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

        {/* Settings for newly selected repo (not yet in active list) */}
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

        {localSettings && !isLoadingSettings && selectedRepo && !isRepoAlreadyActive && (
          <Card>
            <CardHeader>
              <CardTitle>Configure {selectedRepo.owner}/{selectedRepo.name}</CardTitle>
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
                      When enabled, the review agent will automatically review
                      pull requests.
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
                      When enabled, the agent will respond to comments and engage
                      in discussions. When disabled, it will only provide initial
                      reviews.
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
              </div>

              <Button
                className="mt-6"
                onClick={saveSettings}
                disabled={updateSettings.isPending}
              >
                {updateSettings.isPending && (
                  <Loader2 className="size-4 animate-spin mr-2" />
                )}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Active Repositories as Accordions */}
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

            {!isLoadingActivated && activatedRepos.length > 0 && (() => {
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
