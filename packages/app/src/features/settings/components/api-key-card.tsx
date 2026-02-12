import { useApiKeyStatus, useDeleteApiKey, useUpdateApiKey } from "@/features/settings";
import { Loader2 } from "lucide-react";
import { Button } from "components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Input } from "components/components/ui/input";
import { Skeleton } from "components/components/ui/skeleton";
import { useState } from "react";
import { toast } from "sonner";

interface ApiKeyCardProps {
  token?: string;
  orgId?: string | null;
}

/**
 * Card component for managing Anthropic API key (Self-sufficient plan)
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
      toast.success("API key saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save API key");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteApiKey.mutateAsync();
      toast.success("API key removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove API key");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Anthropic API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton muted className="h-12 w-full rounded-3xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anthropic API Key</CardTitle>
        <CardDescription>
          Your Self-sufficient plan requires your own Anthropic API key. You pay Anthropic directly for API
          usage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {apiKeyStatus?.hasKey && !showInput ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-6">
              <Input
                type="password"
                value={apiKeyStatus.maskedKey || ""}
                className="bg-background"
                readOnly
                disabled
              />
              <span className="text-sm text-green-600 dark:text-green-400">Configured</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowInput(true)}>Update Key</Button>
              <Button variant="outline" onClick={handleDelete} disabled={deleteApiKey.isPending}>
                {deleteApiKey.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                Remove Key
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4">
              <Input
                type="password"
                placeholder="sk-ant-..."
                className="bg-background"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
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
            <p className="text-sm text-muted-foreground mt-5 -mb-1">
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
