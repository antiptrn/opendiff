import type { Repository, RepositorySettings } from "@/features/repositories";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "components/components/ui/dialog";
import { Loader2 } from "lucide-react";
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
    autofixEnabled: boolean;
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
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {selectedRepo && settings && !isLoadingSettings && !isRepoAlreadyActive && (
          <RepoSettingsForm
            key={`${selectedRepo.owner}/${selectedRepo.name}-${settings.enabled}-${settings.autofixEnabled}-${settings.sensitivity}-${settings.customReviewRules || ""}`}
            initialSettings={{
              enabled: settings.enabled,
              autofixEnabled: settings.autofixEnabled ?? true,
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
