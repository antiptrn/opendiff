import {
  type AiAuthMethod,
  type AiProvider,
  useAiConfigStatus,
  useAiModels,
  useDeleteAiConfig,
  useUpdateAiConfig,
} from "@/features/settings";
import { Button } from "components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Input } from "components/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/components/ui/select";
import { Skeleton } from "components/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface ApiKeyCardProps {
  token?: string;
  orgId?: string | null;
}

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

const DEFAULT_PROVIDER: AiProvider = "openai";
const DEFAULT_AUTH_METHOD: AiAuthMethod = "OAUTH_TOKEN";
const DEFAULT_MODEL = "openai/gpt-5.2-codex";

function requiresOAuth(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-5.3-codex");
}

export function ApiKeyCard({ token, orgId }: ApiKeyCardProps) {
  const [credentialInput, setCredentialInput] = useState("");
  const [refreshTokenInput, setRefreshTokenInput] = useState("");
  const [accountIdInput, setAccountIdInput] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [provider, setProvider] = useState<AiProvider>(DEFAULT_PROVIDER);
  const [authMethod, setAuthMethod] = useState<AiAuthMethod>(DEFAULT_AUTH_METHOD);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);

  const { data: aiConfigStatus, isLoading } = useAiConfigStatus(token, orgId);
  const { data: modelsData, isLoading: isLoadingModels } = useAiModels(provider, token, orgId);
  const updateAiConfig = useUpdateAiConfig(token, orgId);
  const deleteAiConfig = useDeleteAiConfig(token, orgId);

  const modelOptions = modelsData?.models ?? [];

  useEffect(() => {
    if (!aiConfigStatus) {
      return;
    }

    setProvider(aiConfigStatus.provider || DEFAULT_PROVIDER);
    setAuthMethod(aiConfigStatus.authMethod || DEFAULT_AUTH_METHOD);
    setModel(aiConfigStatus.model || DEFAULT_MODEL);
  }, [aiConfigStatus]);

  useEffect(() => {
    if (modelOptions.length === 0) {
      return;
    }

    const hasCurrentModel = modelOptions.some((option) => option.id === model);
    if (!hasCurrentModel) {
      const defaultOption = modelOptions.find((option) => option.id === DEFAULT_MODEL);
      setModel(defaultOption?.id || modelOptions[0].id);
    }
  }, [modelOptions, model]);

  useEffect(() => {
    if (authMethod === "API_KEY" && requiresOAuth(model)) {
      setAuthMethod("OAUTH_TOKEN");
    }
  }, [authMethod, model]);

  const credentialPlaceholder = useMemo(() => {
    return authMethod === "API_KEY" ? "sk-..." : "Access token";
  }, [authMethod]);

  const helperText = useMemo(() => {
    if (authMethod === "OAUTH_TOKEN") {
      return "Enter your access token, refresh token, and account ID from your ChatGPT session.";
    }

    if (provider === "anthropic") {
      return "Enter an Anthropic API key (starts with sk-ant-...).";
    }

    return "Enter an OpenAI API key (starts with sk-...).";
  }, [authMethod, provider]);

  const handleSave = async () => {
    if (!credentialInput.trim()) {
      return;
    }

    try {
      await updateAiConfig.mutateAsync({
        provider,
        authMethod,
        model,
        credential: credentialInput.trim(),
        ...(authMethod === "OAUTH_TOKEN" && refreshTokenInput.trim()
          ? { refreshToken: refreshTokenInput.trim() }
          : {}),
        ...(authMethod === "OAUTH_TOKEN" && accountIdInput.trim()
          ? { accountId: accountIdInput.trim() }
          : {}),
      });
      setCredentialInput("");
      setRefreshTokenInput("");
      setAccountIdInput("");
      setShowInput(false);
      toast.success("AI configuration saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save AI configuration");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAiConfig.mutateAsync();
      toast.success("AI configuration removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove AI configuration");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Credentials</CardTitle>
        <CardDescription>
          Self-sufficient plans use your own provider credentials. Choose auth method and model.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton muted className="h-12 w-full rounded-3xl" />
        ) : aiConfigStatus?.hasCredential && !showInput ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Provider: {PROVIDER_LABELS[aiConfigStatus.provider || "anthropic"]}
              </div>
              <div className="text-sm text-muted-foreground">
                Method: {aiConfigStatus.authMethod === "OAUTH_TOKEN" ? "OAuth token" : "API token"}
              </div>
              <div className="text-sm text-muted-foreground">Model: {aiConfigStatus.model}</div>
              <div className="flex items-center gap-2 mb-4">
                <Input
                  type="password"
                  value={aiConfigStatus.maskedCredential || ""}
                  className="bg-background"
                  readOnly
                  disabled
                />
                <span className="text-sm text-green-600 dark:text-green-400">Configured</span>
              </div>
              {aiConfigStatus.authMethod === "OAUTH_TOKEN" && (
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">
                    Refresh Token:{" "}
                    {aiConfigStatus.hasRefreshToken ? (
                      <span className="text-green-600 dark:text-green-400">Set</span>
                    ) : (
                      <span className="text-yellow-600 dark:text-yellow-400">Not set</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Account ID:{" "}
                    {aiConfigStatus.hasAccountId ? (
                      <span className="text-green-600 dark:text-green-400">Set</span>
                    ) : (
                      <span className="text-yellow-600 dark:text-yellow-400">Not set</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setShowInput(true)}>Update</Button>
              <Button variant="outline" onClick={handleDelete} disabled={deleteAiConfig.isPending}>
                {deleteAiConfig.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Provider</div>
                <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
                  <SelectTrigger className="w-full transition-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Auth Method</div>
                <Select value={authMethod} onValueChange={(v) => setAuthMethod(v as AiAuthMethod)}>
                  <SelectTrigger className="w-full transition-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="API_KEY" disabled={requiresOAuth(model)}>
                      API token
                    </SelectItem>
                    <SelectItem value="OAUTH_TOKEN">OAuth Token</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Model</div>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="w-full transition-none">
                    <SelectValue
                      placeholder={isLoadingModels ? "Loading models..." : "Select model"}
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {modelOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  {authMethod === "OAUTH_TOKEN" ? "Access Token" : "API Key"}
                </div>
                <Input
                  type="password"
                  placeholder={credentialPlaceholder}
                  className="bg-background"
                  value={credentialInput}
                  onChange={(e) => setCredentialInput(e.target.value)}
                />
              </div>
              {authMethod === "OAUTH_TOKEN" && (
                <>
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Refresh Token</div>
                    <Input
                      type="password"
                      placeholder="Refresh token"
                      className="bg-background"
                      value={refreshTokenInput}
                      onChange={(e) => setRefreshTokenInput(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Account ID</div>
                    <Input
                      type="text"
                      placeholder="Account ID"
                      className="bg-background"
                      value={accountIdInput}
                      onChange={(e) => setAccountIdInput(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="flex gap-3 mt-4">
                <Button
                  className="transition-none"
                  onClick={handleSave}
                  disabled={!credentialInput.trim() || !model || updateAiConfig.isPending}
                >
                  {updateAiConfig.isPending && <Loader2 className="size-4 animate-spin" />}
                  {updateAiConfig.isPending ? "Saving..." : "Save"}
                </Button>
                {showInput && (
                  <Button
                    className="transition-none"
                    variant="secondary"
                    onClick={() => {
                      setShowInput(false);
                      setCredentialInput("");
                      setRefreshTokenInput("");
                      setAccountIdInput("");
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">{helperText}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
