import { useReviewRules, useUpdateReviewRules } from "@/features/settings";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "components/components/ui/button";
import { SettingsSection } from "components/components/console";
import { Skeleton } from "components/components/ui/skeleton";
import { Textarea } from "components/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

const RULES_DESCRIPTION =
  "Rules and guidelines the AI follows when reviewing your code. They're included in every review.";

interface CustomReviewRulesCardProps {
  token?: string;
  orgId?: string | null;
}

/**
 * Props for the rules form component
 */
interface RulesFormProps {
  initialRules: string;
  onSave: (rules: string) => Promise<{ success: boolean; rules: string }>;
  isSaving: boolean;
}

/**
 * Form component for editing review rules
 * Uses key prop pattern - parent resets via key when initial rules change
 */
function RulesForm({ initialRules, onSave, isSaving }: RulesFormProps) {
  const [localRules, setLocalRules] = useState(initialRules);

  const hasChanges = initialRules !== localRules;

  const handleSave = async () => {
    try {
      await onSave(localRules);
      toast.success("Review rules saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save review rules");
    }
  };

  return (
    <div className="space-y-4">
      <Textarea
        placeholder="# Rules&#10;- Always check for proper error handling&#10;- Flag any hardcoded credentials&#10;- Ensure functions have proper TypeScript types&#10;- Check for accessibility issues in React components"
        value={localRules}
        onChange={(e) => setLocalRules(e.target.value)}
        variant="muted"
        minHeight="lg"
        maxLength={5000}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{localRules.length}/5000 characters</p>
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving && <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />}
          {isSaving ? "Saving..." : "Save rules"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Card component for managing custom review rules
 */
export function CustomReviewRulesCard({ token, orgId }: CustomReviewRulesCardProps) {
  const { data: rulesData, isLoading } = useReviewRules(token, orgId);
  const updateRules = useUpdateReviewRules(token, orgId);

  if (isLoading) {
    return (
      <SettingsSection title="Custom review rules" description={RULES_DESCRIPTION}>
        <div>
          <Skeleton muted className="h-[150px] w-full rounded-3xl" />
        </div>
      </SettingsSection>
    );
  }

  const currentRules = rulesData?.rules ?? "";

  return (
    <SettingsSection title="Custom review rules" description={RULES_DESCRIPTION}>
      {/* Key resets form when rules change from server */}
      <RulesForm
        key={currentRules}
        initialRules={currentRules}
        onSave={updateRules.mutateAsync}
        isSaving={updateRules.isPending}
      />
    </SettingsSection>
  );
}
