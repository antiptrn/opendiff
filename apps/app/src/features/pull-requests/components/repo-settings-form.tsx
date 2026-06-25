import { Checkbox } from "components/components/ui/checkbox";
import { Label } from "components/components/ui/label";
import { LoadingButton } from "components/components/ui/loading-button";
import { Slider } from "components/components/ui/slider";
import { Textarea } from "components/components/ui/textarea";
import { useState } from "react";

interface RepoSettingsFormProps {
  initialSettings: {
    enabled: boolean;
    reviewIncludedDirs: string;
    reviewIgnoredDirs: string;
    autofixEnabled: boolean;
    autofixIncludedDirs: string;
    autofixIgnoredDirs: string;
    sensitivity: number;
    customReviewRules: string;
  };
  onSave: (settings: {
    enabled: boolean;
    reviewIncludedDirs: string;
    reviewIgnoredDirs: string;
    autofixEnabled: boolean;
    autofixIncludedDirs: string;
    autofixIgnoredDirs: string;
    sensitivity: number;
    customReviewRules: string;
  }) => Promise<void>;
  isSaving: boolean;
  submitLabel?: string;
  submittingLabel?: string;
}

/**
 * Reusable form for repository settings (reviews, triage, custom rules)
 * Used by both the repository detail page and the add repository dialog
 */
export function RepoSettingsForm({
  initialSettings,
  onSave,
  isSaving,
  submitLabel = "Save Settings",
  submittingLabel = "Saving...",
}: RepoSettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [isDirty, setIsDirty] = useState(false);

  const updateSetting = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSubmit = async () => {
    await onSave(settings);
    setIsDirty(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="mt-[3px]">
          <Checkbox
            id="enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSetting("enabled", checked === true)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="enabled" size="base" interactive>
            Enable Reviews
          </Label>
          <p className="text-sm text-muted-foreground">
            When enabled, the review agent will automatically review pull requests.
          </p>
        </div>
      </div>

      {settings.enabled && (
        <div className="ml-7 space-y-4">
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="review-include-dirs">Review Included Paths</Label>
              <p className="text-sm text-muted-foreground">
                Optional. When set, reviews only run on matching paths. Ignored paths still win.
              </p>
            </div>
            <Textarea
              id="review-include-dirs"
              value={settings.reviewIncludedDirs}
              onChange={(e) => updateSetting("reviewIncludedDirs", e.target.value)}
              placeholder={"apps/app/src/*\npackages/shared/src/types/index.ts"}
              variant="background"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="review-ignore-dirs">Review Ignored Paths</Label>
              <p className="text-sm text-muted-foreground">
                One path pattern per line, such as README.md or apps/bff/src/*.
              </p>
            </div>
            <Textarea
              id="review-ignore-dirs"
              value={settings.reviewIgnoredDirs}
              onChange={(e) => updateSetting("reviewIgnoredDirs", e.target.value)}
              placeholder={"apps/bff/src/*\nREADME.md"}
              variant="background"
              rows={4}
            />
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="mt-[3px]">
          <Checkbox
            id="autofix"
            checked={settings.autofixEnabled}
            onCheckedChange={(checked) => {
              updateSetting("autofixEnabled", checked === true);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="autofix" size="base" interactive>
            Enable Autofix
          </Label>
          <p className="text-sm text-muted-foreground">
            When enabled, the agent will automatically fix issues, apply them to the PR, and address
            comments.
          </p>
        </div>
      </div>

      {settings.autofixEnabled && (
        <div className="ml-7 space-y-4">
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="autofix-include-dirs">Autofix Included Paths</Label>
              <p className="text-sm text-muted-foreground">
                Optional. When set, autofix only edits matching paths. Ignored paths still win.
              </p>
            </div>
            <Textarea
              id="autofix-include-dirs"
              value={settings.autofixIncludedDirs}
              onChange={(e) => updateSetting("autofixIncludedDirs", e.target.value)}
              placeholder={"apps/app/src/*\npackages/shared/src/types/index.ts"}
              variant="background"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="autofix-ignore-dirs">Autofix Ignored Paths</Label>
              <p className="text-sm text-muted-foreground">
                One path pattern per line, such as README.md or apps/bff/src/*.
              </p>
            </div>
            <Textarea
              id="autofix-ignore-dirs"
              value={settings.autofixIgnoredDirs}
              onChange={(e) => updateSetting("autofixIgnoredDirs", e.target.value)}
              placeholder={"apps/bff/src/*\nREADME.md"}
              variant="background"
              rows={4}
            />
          </div>
        </div>
      )}

      {/* Sensitivity slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="sensitivity" size="base">
            Review Sensitivity
          </Label>
          <span className="text-sm text-muted-foreground tabular-nums">
            {settings.sensitivity}%
          </span>
        </div>
        <Slider
          id="sensitivity"
          value={[settings.sensitivity]}
          onValueChange={([value]) => updateSetting("sensitivity", value)}
          min={0}
          max={100}
          step={5}
          disabled={false}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Lenient</span>
          <span>Strict</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Controls how strict the review agent is. Lower values only flag critical issues, higher
          values flag more suggestions and style improvements.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="custom-rules" size="base">
          Custom Review Rules
        </Label>
        <p className="text-sm text-muted-foreground">
          Define custom rules and guidelines for the AI to follow when reviewing code in this
          repository.
        </p>
        <div className="mt-6">
          <Textarea
            id="custom-rules"
            value={settings.customReviewRules}
            onChange={(e) => updateSetting("customReviewRules", e.target.value)}
            placeholder="# Rules&#10;- Always check for proper error handling&#10;- Flag any hardcoded credentials&#10;- Ensure functions have proper TypeScript types&#10;- Check for accessibility issues in React components"
            variant="background"
            minHeight="md"
          />
        </div>
      </div>

      <LoadingButton
        onClick={handleSubmit}
        disabled={!isDirty && submitLabel === "Save Settings"}
        isLoading={isSaving}
        loadingText={submittingLabel}
      >
        {submitLabel}
      </LoadingButton>
    </div>
  );
}
