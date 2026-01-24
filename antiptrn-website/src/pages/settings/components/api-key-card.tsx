import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { useApiKeyStatus, useUpdateApiKey, useDeleteApiKey } from "@/hooks/use-api";

interface ApiKeyCardProps {
  token?: string;
  orgId?: string | null;
}

/**
 * Card component for managing Anthropic API key (BYOK plan)
 */
export function ApiKeyCard({ token, orgId }: ApiKeyCardProps) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showInput, setShowInput] = useState(false);

  const { data: apiKeyStatus, isLoading } = useApiKeyStatus(token, orgId);
  const updateApiKey = useUpdateApiKey(token, orgId);
  const deleteApiKey = useDeleteApiKey(token, orgId);

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
          Your BYOK plan requires your own Anthropic API key. You pay Anthropic directly for API
          usage.
        </p>

        {(updateApiKey.error || deleteApiKey.error) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {updateApiKey.error?.message || deleteApiKey.error?.message}
          </div>
        )}

        {apiKeyStatus?.hasKey && !showInput ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded text-sm">{apiKeyStatus.maskedKey}</code>
              <span className="text-sm text-green-600 dark:text-green-400">Configured</span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowInput(true)}>
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
              <Button onClick={handleSave} disabled={!apiKeyInput.trim() || updateApiKey.isPending}>
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
