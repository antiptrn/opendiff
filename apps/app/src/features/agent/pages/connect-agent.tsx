import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SettingsRow, SettingsSection } from "components/components/console";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/components/ui/alert-dialog";
import { Button } from "components/components/ui/button";
import { Input } from "components/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/components/ui/tabs";
import { formatRelative } from "components/utils";
import { useState } from "react";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { toast } from "sonner";
import {
  type AccessTokenSummary,
  MCP_URL,
  useAccessTokens,
  useCreateAccessToken,
  useRevokeAccessToken,
} from "../hooks/use-access-tokens";

const TOKEN_PLACEHOLDER = "<your-token>";

/** How to add Contrast to each agent, with the token filled in once there is one */
function setupSnippets(token: string) {
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      hint: "Run this in your terminal:",
      code: `claude mcp add --transport http contrast ${MCP_URL} --header "Authorization: Bearer ${token}"`,
    },
    {
      id: "cursor",
      label: "Cursor",
      hint: "Add this to .cursor/mcp.json in your project, or ~/.cursor/mcp.json for every project:",
      code: JSON.stringify(
        {
          mcpServers: {
            contrast: { url: MCP_URL, headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2
      ),
    },
    {
      id: "other",
      label: "Other agents",
      hint: "Any MCP client that supports Streamable HTTP: point it at this URL and send the token as a Bearer header.",
      code: `URL:    ${MCP_URL}\nHeader: Authorization: Bearer ${token}`,
    },
  ];
}

const EXAMPLE_PROMPTS = [
  "What did Contrast find in my open pull requests?",
  "Accept the suggested fixes on pull request #482.",
  "Connect acme/web and review its open pull requests.",
  "Make reviews stricter on acme/api and ignore the generated/ folder.",
];

/** A block of copyable setup text */
function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="rounded-lg bg-muted p-3 pr-12 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
        {code}
      </pre>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={copied ? "Copied" : "Copy"}
        className="absolute top-1.5 right-1.5 !rounded-sm text-muted-foreground hover:text-foreground"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-4" />
      </Button>
    </div>
  );
}

/**
 * The Install page: everything Contrast does is also available to your AI agent through its
 * MCP server, so this page creates an access token and shows how to connect each agent.
 */
export function ConnectAgentPage() {
  const { user } = useAuth();
  const { currentOrgId, currentOrg } = useOrganization();
  const { data } = useAccessTokens(user?.access_token, currentOrgId);
  const createToken = useCreateAccessToken(user?.access_token, currentOrgId);
  const revokeToken = useRevokeAccessToken(user?.access_token, currentOrgId);

  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<AccessTokenSummary | null>(null);
  const tokens = data?.tokens ?? [];

  const create = async () => {
    try {
      const result = await createToken.mutateAsync(name.trim() || "My agent");
      setNewToken(result.token);
      setName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create a token");
    }
  };

  return (
    <div className="flex w-full flex-col gap-10 py-4">
      <p className="max-w-3xl px-4 text-base text-muted-foreground">
        Work with Contrast from your AI agent: ask about your reviews, accept fixes and set up
        repositories, all through Contrast's MCP server. Connect an agent in two steps.
      </p>

      <SettingsSection
        title="1. Create an access token"
        description={`Tokens act as you, in ${currentOrg?.name ?? "this organization"} only, and can't change billing, members or your account.`}
      >
        {newToken ? (
          <div className="space-y-3">
            <p className="text-sm">
              Copy your token now. You won't be able to see it again.
            </p>
            <CopyBlock code={newToken} />
            <Button size="sm" variant="secondary" onClick={() => setNewToken(null)}>
              Done
            </Button>
          </div>
        ) : (
          <SettingsRow title="New token" description="Name it after the agent or machine using it">
            <Input
              variant="muted"
              size="sm"
              className="w-56"
              placeholder="Claude Code on my laptop"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && create()}
            />
            <Button size="sm" disabled={createToken.isPending} onClick={create}>
              Create
            </Button>
          </SettingsRow>
        )}
        {tokens.map((token) => (
          <SettingsRow
            key={token.id}
            title={token.name}
            description={`${token.tokenPrefix}… · created ${formatRelative(token.createdAt)} · ${
              token.lastUsedAt ? `last used ${formatRelative(token.lastUsedAt)}` : "never used"
            }`}
          >
            <Button size="sm" variant="ghost" onClick={() => setRevoking(token)}>
              Revoke
            </Button>
          </SettingsRow>
        ))}
      </SettingsSection>

      <SettingsSection
        title="2. Add Contrast to your agent"
        description={
          newToken
            ? "Your new token is already filled in below."
            : `Replace ${TOKEN_PLACEHOLDER} with the token you created.`
        }
      >
        <Tabs defaultValue="claude-code" className="gap-4">
          <TabsList variant="line">
            {setupSnippets(TOKEN_PLACEHOLDER).map((snippet) => (
              <TabsTrigger key={snippet.id} value={snippet.id}>
                {snippet.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {setupSnippets(newToken ?? TOKEN_PLACEHOLDER).map((snippet) => (
            <TabsContent key={snippet.id} value={snippet.id} className="space-y-2">
              <p className="text-sm text-muted-foreground">{snippet.hint}</p>
              <CopyBlock code={snippet.code} />
            </TabsContent>
          ))}
        </Tabs>
      </SettingsSection>

      <SettingsSection title="Then try asking" description="Your agent can do anything you can do in the console.">
        <ul className="space-y-2 text-sm">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <li key={prompt}>“{prompt}”</li>
          ))}
        </ul>
      </SettingsSection>

      <AlertDialog open={!!revoking} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Agents using this token lose access to Contrast straight away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                if (revoking) {
                  revokeToken.mutate(revoking.id, {
                    onError: (error) => toast.error(error.message),
                  });
                }
                setRevoking(null);
              }}
            >
              Revoke
            </AlertDialogAction>
            <AlertDialogCancel variant="default">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
