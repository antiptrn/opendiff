import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { useReviewRules, useUpdateReviewRules } from "@/hooks/use-api";

interface CustomReviewRulesCardProps {
  token?: string;
  orgId?: string | null;
}

/**
 * Card component for managing custom review rules
 */
export function CustomReviewRulesCard({ token, orgId }: CustomReviewRulesCardProps) {
  const [localRules, setLocalRules] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: rulesData, isLoading } = useReviewRules(token, orgId);
  const updateRules = useUpdateReviewRules(token, orgId);

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
        <CardDescription>
          Define custom rules and guidelines for the AI to follow when reviewing your code. These rules will be included in every review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {updateRules.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {updateRules.error?.message}
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600 dark:bg-green-400/10 dark:text-green-400">
            {successMessage}
          </div>
        )}

        <Textarea
          placeholder="# Rules&#10;- Always check for proper error handling&#10;- Flag any hardcoded credentials&#10;- Ensure functions have proper TypeScript types&#10;- Check for accessibility issues in React components"
          value={localRules}
          onChange={(e) => setLocalRules(e.target.value)}
          className="min-h-[150px]"
          maxLength={5000}
        />

        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-muted-foreground">
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
