import { useReviewRules, useUpdateReviewRules } from "@/features/settings";
import { Loader2 } from "lucide-react";
import { Button } from "components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Skeleton } from "components/components/ui/skeleton";
import { Textarea } from "components/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

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
    <CardContent className="space-y-4">
      <Textarea
        placeholder="# Rules&#10;- Always check for proper error handling&#10;- Flag any hardcoded credentials&#10;- Ensure functions have proper TypeScript types&#10;- Check for accessibility issues in React components"
        value={localRules}
        onChange={(e) => setLocalRules(e.target.value)}
        className="min-h-[150px] bg-background"
        maxLength={5000}
      />

      <div className="flex items-center justify-between mt-6">
        <p className="text-sm text-muted-foreground">{localRules.length}/5000 characters</p>
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {isSaving ? "Saving..." : "Save Rules"}
        </Button>
      </div>
    </CardContent>
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
      <Card>
        <CardHeader>
          <CardTitle>Custom Review Rules</CardTitle>
          <CardDescription>
            Define custom rules and guidelines for the AI to follow when reviewing your code. These
            rules will be included in every review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton muted className="h-[150px] w-full rounded-3xl" />
        </CardContent>
      </Card>
    );
  }

  const currentRules = rulesData?.rules ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Review Rules</CardTitle>
        <CardDescription>
          Define custom rules and guidelines for the AI to follow when reviewing your code. These
          rules will be included in every review.
        </CardDescription>
      </CardHeader>
      {/* Key resets form when rules change from server */}
      <RulesForm
        key={currentRules}
        initialRules={currentRules}
        onSave={updateRules.mutateAsync}
        isSaving={updateRules.isPending}
      />
    </Card>
  );
}
