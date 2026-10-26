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
import { Checkbox } from "components/components/ui/checkbox";
import { Label } from "components/components/ui/label";
import { useEffect, useState } from "react";
import { RepoSettingsForm } from "./repo-settings-form";

interface ConfigRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRepo: Repository | null;
  settings: RepositorySettings | undefined;
  isLoadingSettings: boolean;
  isRepoAlreadyActive: boolean;
  onSave: (
    settings: {
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
    options: { reviewOpenPulls: boolean }
  ) => Promise<void>;
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
  // Off by default: reviewing a backlog of pull requests can use a lot of review tokens
  const [reviewOpenPulls, setReviewOpenPulls] = useState(false);
  useEffect(() => {
    if (open) setReviewOpenPulls(false);
  }, [open]);

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
            onSave={(newSettings) => onSave(newSettings, { reviewOpenPulls })}
            isSaving={isSaving}
            beforeSubmit={(current) =>
              current.enabled && (
                <div className="flex items-start gap-3">
                  <div className="mt-[3px]">
                    <Checkbox
                      id="review-open-pulls"
                      checked={reviewOpenPulls}
                      onCheckedChange={(checked) => setReviewOpenPulls(checked === true)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="review-open-pulls" size="base" interactive>
                      Review open pull requests
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Review every pull request that's already open, not just new ones. Drafts are
                      skipped.
                    </p>
                  </div>
                </div>
              )
            }
            submitLabel="Connect Repository"
            submittingLabel="Adding..."
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
