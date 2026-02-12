import { Checkbox } from "components/components/ui/checkbox";
import { Label } from "components/components/ui/label";
import { LoadingButton } from "components/components/ui/loading-button";
import { Slider } from "components/components/ui/slider";
import { Textarea } from "components/components/ui/textarea";
import { useState } from "react";

interface RepoSettingsFormProps {
  initialSettings: {
    enabled: boolean;
    autofixEnabled: boolean;
    sensitivity: number;
    customReviewRules: string;
  };
  onSave: (settings: {
    enabled: boolean;
    autofixEnabled: boolean;
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
        <Checkbox
          id="enabled"
          checked={settings.enabled}
          onCheckedChange={(checked) => updateSetting("enabled", checked === true)}
          className="mt-[3px]"
        />
        <div className="space-y-1">
          <Label htmlFor="enabled" className="text-base cursor-pointer">
            Enable Reviews
          </Label>
          <p className="text-sm text-muted-foreground">
            When enabled, the review agent will automatically review pull requests.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="autofix"
          checked={settings.autofixEnabled}
          onCheckedChange={(checked) => {
            updateSetting("autofixEnabled", checked === true);
          }}
          className="mt-[3px]"
        />
        <div className="space-y-1">
          <Label htmlFor="autofix" className="text-base cursor-pointer">
            Enable Autofix
          </Label>
          <p className="text-sm text-muted-foreground">
            When enabled, the agent will automatically fix issues, apply them to the PR, and address
            comments.
          </p>
        </div>
      </div>

      {/* Sensitivity slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="sensitivity" className="text-base">
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
          className="w-full"
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
        <Label htmlFor="custom-rules" className="text-base">
          Custom Review Rules
        </Label>
        <p className="text-sm text-muted-foreground">
          Define custom rules and guidelines for the AI to follow when reviewing code in this
          repository.
        </p>
        <Textarea
          id="custom-rules"
          value={settings.customReviewRules}
          onChange={(e) => updateSetting("customReviewRules", e.target.value)}
          placeholder="# Rules&#10;- Always check for proper error handling&#10;- Flag any hardcoded credentials&#10;- Ensure functions have proper TypeScript types&#10;- Check for accessibility issues in React components"
          className="min-h-[120px] mt-6 bg-background"
        />
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
