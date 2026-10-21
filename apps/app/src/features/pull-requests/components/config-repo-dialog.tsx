import type { Repository, RepositorySettings } from "@/features/repositories";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "components/components/ui/dialog";
import { RepoSettingsForm } from "./repo-settings-form";

interface ConfigRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRepo: Repository | null;
  settings: RepositorySettings | undefined;
  isLoadingSettings: boolean;
  isRepoAlreadyActive: boolean;
  onSave: (settings: {
    enabled: boolean;
    approveEnabled: boolean;
    reviewIncludedDirs: string;
    reviewIgnoredDirs: string;
    autofixEnabled: boolean;
    autofixIncludedDirs: string;
    autofixIgnoredDirs: string;
    sensitivity: number;
    customReviewRules: string;
  }) => Promise<void>;
  isSaving: boolean;
}

/**
 * Dialog for configuring a newly selected repository
 */
export function ConfigRepoDialog({
  open,
  onOpenChange,
  selectedRepo,
  settings,
  isLoadingSettings,
  isRepoAlreadyActive,
  onSave,
  isSaving,
}: ConfigRepoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure Repository</DialogTitle>
          <DialogDescription>
            Configure review settings for {selectedRepo?.full_name}.
          </DialogDescription>
        </DialogHeader>

        {isRepoAlreadyActive && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
            This repository is already added to your organization.
          </div>
        )}

        {isLoadingSettings && (
          <div className="flex items-center justify-center py-6">
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-6 animate-spin text-muted-foreground"
            />
          </div>
        )}

        {selectedRepo && settings && !isLoadingSettings && !isRepoAlreadyActive && (
          <RepoSettingsForm
            key={`${selectedRepo.owner}/${selectedRepo.name}-${settings.enabled}-${settings.approveEnabled}-${settings.reviewIncludedDirs || ""}-${settings.reviewIgnoredDirs || ""}-${settings.autofixEnabled}-${settings.autofixIncludedDirs || ""}-${settings.autofixIgnoredDirs || ""}-${settings.sensitivity}-${settings.customReviewRules || ""}`}
            initialSettings={{
              enabled: settings.enabled,
              approveEnabled: settings.approveEnabled ?? false,
              reviewIncludedDirs: settings.reviewIncludedDirs || "",
              reviewIgnoredDirs: settings.reviewIgnoredDirs || "",
              autofixEnabled: settings.autofixEnabled ?? true,
              autofixIncludedDirs: settings.autofixIncludedDirs || "",
              autofixIgnoredDirs: settings.autofixIgnoredDirs || "",
              sensitivity: settings.sensitivity ?? 50,
              customReviewRules: settings.customReviewRules || "",
            }}
            onSave={onSave}
            isSaving={isSaving}
            submitLabel="Add Repository"
            submittingLabel="Adding..."
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
