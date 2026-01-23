import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import imageCompression from "browser-image-compression";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ExternalLink, Download, UserPlus, Copy, Check, Trash2, MoreHorizontal, Mail, Link as LinkIcon, Minus, Plus, Upload, Building2, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, type OrganizationRole } from "@/hooks/use-auth";
import {
  useOrganization,
  useOrganizationMembers,
  useOrganizationInvites,
  useUpdateMemberRole,
  useRemoveMember,
  useLeaveOrganization,
  useManageSubscription,
  useCancelSubscription as useCancelOrgSubscription,
  useReactivateSubscription as useReactivateOrgSubscription,
  useAssignSeat,
  useUnassignSeat,
  useReassignSeat,
  useUpdateSeatCount,
  usePreviewSeatChange,
  type OrgSubscription,
} from "@/hooks/use-organization";
import {
  useApiKeyStatus,
  useUpdateApiKey,
  useDeleteApiKey,
  useReviewRules,
  useUpdateReviewRules,
  useBilling,
  useGetInvoice,
  useExportData,
  useDeleteAccount,
  useLinkGitHub,
  useApi,
} from "@/hooks/use-api";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ==================== UTILITY FUNCTIONS ====================

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getTierName(tier?: string | null): string {
  switch (tier) {
    case "BYOK":
      return "BYOK";
    case "CODE_REVIEW":
      return "Code Review";
    case "TRIAGE":
      return "Triage";
    default:
      return "Free";
  }
}

function formatRoleName(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

// ==================== GENERAL TAB COMPONENTS ====================

function ApiKeyCard({ token, orgId }: { token?: string; orgId?: string | null }) {
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
          Your BYOK plan requires your own Anthropic API key. You pay Anthropic directly for API usage.
        </p>

        {(updateApiKey.error || deleteApiKey.error) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {updateApiKey.error?.message || deleteApiKey.error?.message}
          </div>
        )}

        {apiKeyStatus?.hasKey && !showInput ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded text-sm">
                {apiKeyStatus.maskedKey}
              </code>
              <span className="text-sm text-green-600 dark:text-green-400">Configured</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowInput(true)}
              >
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
              <Button
                onClick={handleSave}
                disabled={!apiKeyInput.trim() || updateApiKey.isPending}
              >
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

function CustomReviewRulesCard({ token, orgId }: { token?: string; orgId?: string | null }) {
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
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Define custom rules and guidelines for the AI to follow when reviewing your code. These rules will be included in every review.
        </p>

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
          placeholder="Example rules:&#10;- Always check for proper error handling&#10;- Flag any hardcoded credentials&#10;- Ensure functions have proper TypeScript types&#10;- Check for accessibility issues in React components"
          value={localRules}
          onChange={(e) => setLocalRules(e.target.value)}
          className="min-h-[150px] font-mono text-sm"
          maxLength={5000}
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {localRules.length}/5000 characters
          </p>
          <Button
            size="sm"
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

function AccountManagementCard({ token, orgId, logout }: { token?: string; orgId?: string | null; logout: () => void }) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const exportData = useExportData(token, orgId);
  const deleteAccount = useDeleteAccount(token);

  const handleExportData = async () => {
    setErrorMessage(null);
    try {
      const data = await exportData.mutateAsync();
      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `antiptrn-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to export data");
    }
  };

  const handleDeleteAccount = async () => {
    setShowDeleteDialog(false);
    setErrorMessage(null);
    try {
      await deleteAccount.mutateAsync();
      logout();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete account");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm">Export my data</p>
            <p className="text-sm text-muted-foreground">
              Download all your data as a JSON file.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportData}
            disabled={exportData.isPending}
          >
            {exportData.isPending && <Loader2 className="size-4 animate-spin" />}
            {exportData.isPending ? "Exporting..." : "Export Data"}
          </Button>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm text-destructive">Delete my account</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteAccount.isPending}
          >
            {deleteAccount.isPending && <Loader2 className="size-4 animate-spin" />}
            {deleteAccount.isPending ? "Deleting..." : "Delete Account"}
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your account? This action cannot be undone. All your data, settings, and subscription will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              onClick={handleDeleteAccount}
              variant="destructive"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LeaveOrganizationCard({ orgId, orgName }: { orgId: string | null; orgName: string }) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const leaveOrganization = useLeaveOrganization(orgId);

  const handleLeave = async () => {
    try {
      await leaveOrganization.mutateAsync();
      setShowLeaveDialog(false);
      // The organization queries will be invalidated and the user will be redirected
      // to create-organization if they have no orgs left
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave Organization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {leaveOrganization.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {leaveOrganization.error?.message}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm">Leave {orgName}</p>
            <p className="text-sm text-muted-foreground">
              You will lose access to this organization and its repositories.
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowLeaveDialog(true)}
            disabled={leaveOrganization.isPending}
          >
            {leaveOrganization.isPending && <Loader2 className="size-4 animate-spin" />}
            Leave
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave {orgName}? You will lose access to this organization and all its repositories. You'll need to be re-invited to rejoin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              onClick={handleLeave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {leaveOrganization.isPending && <Loader2 className="size-4 animate-spin" />}
              Leave Organization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LinkGitHubCard({ token, onLinked }: { token?: string; onLinked?: () => void }) {
  const linkGitHub = useLinkGitHub(token);
  const [searchParams, setSearchParams] = useSearchParams();
  const githubLinked = searchParams.get("github_linked") === "true";
  const error = searchParams.get("error");

  // Clear URL params and notify parent when GitHub was just linked
  useEffect(() => {
    if (githubLinked) {
      onLinked?.();
      // Clear the URL param after a delay so user sees the success message
      const timer = setTimeout(() => {
        setSearchParams((params) => {
          params.delete("github_linked");
          return params;
        });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [githubLinked, onLinked, setSearchParams]);

  const handleLinkGitHub = async () => {
    try {
      const { url } = await linkGitHub.mutateAsync();
      window.location.href = url;
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SiGithub className="size-5" />
          Link GitHub Account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {githubLinked && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600 dark:bg-green-400/10 dark:text-green-400">
            GitHub account linked successfully! You can now access your repositories.
          </div>
        )}

        {error === "github_link_failed" && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Failed to link GitHub account. Please try again.
          </div>
        )}

        {error === "github_already_linked" && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            This GitHub account is already linked to another user.
          </div>
        )}

        {linkGitHub.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {linkGitHub.error?.message}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Link your GitHub account to access your repositories and enable code reviews.
        </p>

        <Button
          size="sm"
          onClick={handleLinkGitHub}
          disabled={linkGitHub.isPending}
        >
          {linkGitHub.isPending && <Loader2 className="size-4 animate-spin" />}
          <SiGithub className="size-4" />
          Link GitHub Account
        </Button>
      </CardContent>
    </Card>
  );
}

function GeneralTab({ user, logout, orgId, setUser }: { user: ReturnType<typeof useAuth>["user"]; logout: () => void; orgId?: string | null; setUser: ReturnType<typeof useAuth>["setUser"] }) {
  const { currentSeat, hasSeat, currentOrg } = useOrganization();
  const tier = hasSeat ? currentSeat?.tier : null;

  // Solo users don't see leave organization option
  const isSoloUser = user?.accountType === "SOLO";
  // Owners cannot leave - they must transfer ownership first
  const isOwner = currentOrg?.role === "OWNER";
  // Show leave option for non-solo, non-owner users
  const canLeaveOrg = !isSoloUser && !isOwner && currentOrg;

  // Show GitHub link card for Google users who haven't linked GitHub
  const needsGithubLink = user?.auth_provider === "google" && !user?.hasGithubLinked;

  const handleGithubLinked = () => {
    if (user) {
      setUser({ ...user, hasGithubLinked: true });
    }
  };

  return (
    <div className="space-y-6">
      {/* Link GitHub - for Google users without GitHub linked */}
      {needsGithubLink && <LinkGitHubCard token={user?.access_token} onLinked={handleGithubLinked} />}

      {/* Install GitHub App */}
      <Card>
        <CardHeader>
          <CardTitle>Install GitHub App</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Install the GitHub App on your repositories to enable code reviews. You can install it on your personal account or any organization you have access to.
          </p>
          <Button size="sm" asChild>
            <a
              href="https://github.com/apps/antiptrn-review-agent/installations/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              Install GitHub App
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* BYOK API Key Card */}
      {tier === "BYOK" && <ApiKeyCard token={user?.access_token} orgId={orgId} />}

      {/* Custom Review Rules - available for all paid plans */}
      {tier && <CustomReviewRulesCard token={user?.access_token} orgId={orgId} />}

      {/* Leave Organization - for non-solo, non-owner team members */}
      {canLeaveOrg && <LeaveOrganizationCard orgId={orgId ?? null} orgName={currentOrg.name} />}

      {/* Account Management */}
      <AccountManagementCard token={user?.access_token} orgId={orgId} logout={logout} />
    </div>
  );
}

// ==================== BILLING TAB COMPONENT ====================

// ==================== BILLING HISTORY COMPONENT ====================

function BillingHistoryCard({ user, orgId, isSoloUser }: { user: ReturnType<typeof useAuth>["user"]; orgId?: string | null; isSoloUser?: boolean }) {
  const { data: billing, isLoading } = useBilling(user?.access_token, orgId);
  const getInvoice = useGetInvoice(user?.access_token);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const orders = billing?.orders || [];

  const handleDownloadInvoice = async (orderId: string) => {
    setDownloadingInvoice(orderId);
    setErrorMessage(null);
    try {
      const result = await getInvoice.mutateAsync(orderId);
      if (result.invoiceUrl) {
        window.open(result.invoiceUrl, "_blank");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to get invoice");
    } finally {
      setDownloadingInvoice(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing History</CardTitle>
      </CardHeader>
      <CardContent>
        {errorMessage && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive mb-4">
            {errorMessage}
          </div>
        )}
        {isLoading ? (
          <div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center py-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-8" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No billing history yet
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Date</th>
                  <th className="pb-2 font-medium text-muted-foreground">Plan</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Amount</th>
                  <th className="pb-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0">
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {formatDate(order.createdAt)}
                      </span>
                    </td>
                    <td className="py-3">
                      {isSoloUser
                        ? order.productName
                          .replace(/^1\s*[×x]\s*/i, "")
                          .replace(/\(at\s+/i, "at ")
                          .replace(/\s*\/\s*(month|year)\)/, " / $1")
                        : order.productName}
                    </td>
                    <td className="py-3 text-right">
                      {formatCurrency(order.amount, order.currency)}
                    </td>
                    <td className="py-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadInvoice(order.id)}
                        disabled={downloadingInvoice === order.id}
                      >
                        {downloadingInvoice === order.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Download className="size-4" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== BILLING TAB COMPONENT ====================

function BillingTab({ user, orgId, isSoloUser }: { user: ReturnType<typeof useAuth>["user"]; orgId?: string | null; isSoloUser?: boolean }) {
  const { currentSeat, hasSeat } = useOrganization();

  const { isLoading } = useBilling(user?.access_token, orgId);

  const hasSubscription = hasSeat && currentSeat?.tier;
  const cancelAtPeriodEnd = currentSeat?.cancelAtPeriodEnd;

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-lg">{getTierName(currentSeat?.tier)}</p>
                {hasSubscription ? (
                  cancelAtPeriodEnd ? (
                    <p className="text-sm text-orange-600 dark:text-orange-400">
                      Cancels {formatDate(currentSeat?.expiresAt)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Renews {formatDate(currentSeat?.expiresAt)}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    You're on the free plan
                  </p>
                )}
              </div>

              {!hasSubscription && (
                <Button size="sm" asChild>
                  <Link to="/pricing">Upgrade</Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription Details - only show when user has a subscription */}
      {(hasSubscription || isLoading) && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription Details</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </dl>
            ) : currentSeat && hasSubscription ? (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    {currentSeat.status === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1.5">
                        {cancelAtPeriodEnd ? <Badge variant="secondary" className="bg-orange-600/10 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400">Cancelling</Badge> : <Badge variant="secondary" className="bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400">Active</Badge>}
                      </span>
                    ) : (
                      <span className="text-orange-600 dark:text-orange-400">
                        {currentSeat.status}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd>{getTierName(currentSeat.tier)}</dd>
                </div>
                {currentSeat.expiresAt && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                    </dt>
                    <dd>{formatDate(currentSeat.expiresAt)}</dd>
                  </div>
                )}
              </dl>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Billing History */}
      <BillingHistoryCard user={user} orgId={orgId} isSoloUser={isSoloUser} />
    </div>
  );
}

// ==================== ORGANIZATION TAB ====================

// ==================== SEAT MANAGEMENT COMPONENT ====================

function SeatManagementCard({
  orgId,
  subscription,
  seats,
}: {
  orgId: string | null;
  subscription: OrgSubscription | null;
  seats: { total: number; assigned: number; available: number } | null;
}) {
  const [pendingSeatCount, setPendingSeatCount] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const currentSeatCount = subscription?.seatCount ?? 0;
  const assignedSeats = seats?.assigned ?? 0;
  const isCancelling = subscription?.cancelAtPeriodEnd ?? false;

  // Use pendingSeatCount for preview, but only if it differs from current
  const previewCount = pendingSeatCount !== null && pendingSeatCount !== currentSeatCount
    ? pendingSeatCount
    : null;

  const { data: preview, isLoading: isLoadingPreview } = usePreviewSeatChange(orgId, previewCount);
  const updateSeatCountMutation = useUpdateSeatCount(orgId);
  const reactivateSubscriptionMutation = useReactivateOrgSubscription(orgId);

  // Reset pending count when subscription changes
  useEffect(() => {
    setPendingSeatCount(null);
  }, [currentSeatCount]);

  const displaySeatCount = pendingSeatCount ?? currentSeatCount;
  const hasChanges = pendingSeatCount !== null && pendingSeatCount !== currentSeatCount;
  const isAddingSeats = hasChanges && pendingSeatCount !== null && pendingSeatCount > currentSeatCount;
  const willReactivate = isCancelling && isAddingSeats;

  const handleIncrement = () => {
    const newCount = Math.min(100, displaySeatCount + 1);
    setPendingSeatCount(newCount);
  };

  const handleDecrement = () => {
    // Can't go below assigned seats or 1
    const minSeats = Math.max(1, assignedSeats);
    const newCount = Math.max(minSeats, displaySeatCount - 1);
    setPendingSeatCount(newCount);
  };

  const handleConfirmUpdate = async () => {
    if (pendingSeatCount === null) return;

    try {
      // If adding seats to a cancelling subscription, reactivate it first
      if (willReactivate) {
        await reactivateSubscriptionMutation.mutateAsync();
      }
      await updateSeatCountMutation.mutateAsync(pendingSeatCount);
      setShowConfirmDialog(false);
      // Don't reset pendingSeatCount here - let the useEffect do it when
      // currentSeatCount updates from the refetch to avoid flashing old value
    } catch {
      // Error handled by mutation
    }
  };

  const isPending = updateSeatCountMutation.isPending || reactivateSubscriptionMutation.isPending;

  const formatCents = (cents: number) => {
    const dollars = Math.abs(cents) / 100;
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(dollars);
    return cents < 0 ? `-${formatted}` : formatted;
  };

  if (!subscription || subscription.status !== "ACTIVE") {
    return null;
  }

  // Get price per seat based on tier
  const tierPrices: Record<string, number> = {
    BYOK: 9,
    CODE_REVIEW: 19,
    TRIAGE: 49,
  };
  const pricePerSeat = tierPrices[subscription.tier] ?? 19;
  const monthlyTotal = displaySeatCount * pricePerSeat;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Seats</CardTitle>
        <CardDescription>
          Add or remove seats from your subscription
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Current: {currentSeatCount} {currentSeatCount === 1 ? "seat" : "seats"} (${currentSeatCount * pricePerSeat}/month)
            </p>
            <p className="text-sm text-muted-foreground">
              Assigned: {assignedSeats}/{currentSeatCount}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={handleDecrement}
            disabled={displaySeatCount <= Math.max(1, assignedSeats)}
          >
            <span className="text-lg font-semibold">-</span>
          </Button>

          <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-2xl">{displaySeatCount}</span>
            <span className="text-xs text-muted-foreground">seats</span>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={handleIncrement}
            disabled={displaySeatCount >= 100}
          >
            <span className="text-lg font-semibold">+</span>
          </Button>

          {hasChanges && (
            <Button
              size="sm"
              onClick={() => setShowConfirmDialog(true)}
              disabled={isPending}
            >
              {isPending && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {willReactivate ? "Update & Reactivate" : "Update Seats"}
            </Button>
          )}
        </div>

        {hasChanges && (
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            {willReactivate && (
              <p className="text-sm text-green-600 font-medium">
                This will reactivate your subscription
              </p>
            )}
            {isLoadingPreview ? (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Calculating proration...</span>
              </div>
            ) : preview ? (
              <>
                <div className="space-y-1">
                  <p className="text-sm">Charge today:</p>
                  {preview.proratedCharge !== 0 ? (
                    <p className="text-base">
                      {preview.proratedCharge > 0 ? (
                        <span className="">{formatCents(preview.proratedCharge)}</span>
                      ) : (
                        <span className="text-green-600">{formatCents(preview.proratedCharge)}</span>
                      )}
                      <span className="text-sm text-muted-foreground ml-1">
                        {preview.proratedCharge > 0 ? "(prorated)" : "(credit applied to next invoice)"}
                      </span>
                    </p>
                  ) : (
                    <p className="text-base font-semibold text-muted-foreground">$0.00</p>
                  )}
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    Next billing amount: <span className="font-medium">{formatCents(preview.nextBillingAmount)}</span>/month
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                New total: ${monthlyTotal}/month
              </p>
            )}
          </div>
        )}

        {(updateSeatCountMutation.error || reactivateSubscriptionMutation.error) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {updateSeatCountMutation.error?.message || reactivateSubscriptionMutation.error?.message}
          </div>
        )}

        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {willReactivate ? "Confirm Seat Change & Reactivation" : "Confirm Seat Change"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    You are changing from {currentSeatCount} to {pendingSeatCount} {pendingSeatCount === 1 ? "seat" : "seats"}.
                  </p>
                  {willReactivate && (
                    <p className="text-green-600">
                      This will also reactivate your subscription.
                    </p>
                  )}
                  {preview && preview.proratedCharge !== 0 && (
                    <p>
                      {preview.proratedCharge > 0 ? (
                        <>You will be charged <span className="font-medium">{formatCents(preview.proratedCharge)}</span> today (prorated).</>
                      ) : (
                        <>You will receive a credit of <span className="font-medium text-green-600">{formatCents(Math.abs(preview.proratedCharge))}</span> on your next invoice.</>
                      )}
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
              <AlertDialogAction size="sm" onClick={handleConfirmUpdate}>
                {isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {willReactivate ? "Confirm & Reactivate" : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

const roleBadgeVariant: Record<OrganizationRole, "default" | "secondary" | "outline"> = {
  OWNER: "secondary",
  ADMIN: "secondary",
  MEMBER: "secondary",
};

const tierLabels: Record<string, string> = {
  BYOK: "BYOK",
  CODE_REVIEW: "Review",
  TRIAGE: "Triage",
};

function SeatBadge({ hasSeat }: { hasSeat: boolean }) {
  if (!hasSeat) {
    return <span className="text-sm text-muted-foreground">No seat</span>;
  }

  return <Badge variant="secondary" className="bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400">Seat assigned</Badge>;
}

function SubscriptionBadge({ subscription }: { subscription: OrgSubscription | null }) {
  if (!subscription || !subscription.tier) {
    return <span className="text-sm text-muted-foreground">No subscription</span>;
  }

  const tierLabel = tierLabels[subscription.tier] || subscription.tier;

  if (subscription.cancelAtPeriodEnd) {
    return (
      <Badge variant="secondary" className="bg-orange-600/10 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400">
        Cancelling
      </Badge>
    );
  }

  if (subscription.status !== "ACTIVE") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {tierLabel} - {subscription.status}
      </Badge>
    );
  }

  return <Badge variant="secondary">{tierLabel} ({subscription.seatCount} seats)</Badge>;
}

function OrganizationCard({ orgId, avatarUrl, orgName, onUpdated }: {
  orgId: string | null;
  avatarUrl: string | null;
  orgName: string;
  onUpdated: () => void;
}) {
  const api = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState(orgName);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset name input when orgName changes
  useEffect(() => {
    setNameInput(orgName);
  }, [orgName]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Compress the image
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 256,
        useWebWorker: true,
      });

      const formData = new FormData();
      formData.append("file", compressedFile);
      const response = await api.upload(`/api/organizations/${orgId}/avatar`, formData);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload avatar");
      }

      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteAvatar = async () => {
    if (!orgId) return;

    setIsDeleting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await api.delete(`/api/organizations/${orgId}/avatar`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete avatar");
      }

      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete avatar");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveName = async () => {
    if (!orgId || !nameInput.trim() || nameInput.trim() === orgName) return;

    if (nameInput.trim().length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }

    setIsSavingName(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await api.put(`/api/organizations/${orgId}`, { name: nameInput.trim() });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update organization name");
      }

      setSuccessMessage("Organization name updated");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update organization name");
    } finally {
      setIsSavingName(false);
    }
  };

  const hasNameChanges = nameInput.trim() !== orgName;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
        <CardDescription>Manage your organization's profile</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600 dark:bg-green-400/10 dark:text-green-400">
            {successMessage}
          </div>
        )}

        {/* Avatar */}
        <div className="space-y-2">
          <Label>Avatar</Label>
          <div className="flex flex-col items-start gap-4">
            <div className="relative">
              <Avatar className="size-16 rounded-xl overflow-hidden">
                <AvatarImage src={avatarUrl ?? undefined} alt={orgName} />
                <AvatarFallback className="text-3xl">{orgName.charAt(0)}</AvatarFallback>
              </Avatar>
            </div>

            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isDeleting || isSavingName}
              >
                {isUploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {avatarUrl ? "Change" : "Upload"}
              </Button>
              {avatarUrl && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteAvatar}
                  disabled={isUploading || isDeleting || isSavingName}
                >
                  {isDeleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Remove
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Recommended: Square image, at least 128x128 pixels.
          </p>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="org-name">Name</Label>
          <div className="flex flex-col gap-4">
            <Input
              id="org-name"
              size="sm"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              disabled={isUploading || isDeleting || isSavingName}
              placeholder="Organization name"
            />
            <Button
              className="w-fit"
              size="sm"
              onClick={handleSaveName}
              disabled={!hasNameChanges || isSavingName || isUploading || isDeleting}
            >
              {isSavingName ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizationTab({ user, orgId }: { user: ReturnType<typeof useAuth>["user"]; orgId: string | null }) {
  const { orgDetails, canManageMembers, canManageBilling, canUpdateOrg, subscription, seats, currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  const { data: membersData, isLoading: isLoadingMembers } = useOrganizationMembers(orgId);
  const members = membersData?.members || [];
  const quotaPool = membersData?.quotaPool || orgDetails?.quotaPool;
  const seatsInfo = membersData?.seats || seats;

  const {
    invites,
    isLoading: isLoadingInvites,
    createInvite,
    isCreatingInvite,
    revokeInvite,
  } = useOrganizationInvites(orgId);
  const updateRoleMutation = useUpdateMemberRole(orgId);
  const removeMemberMutation = useRemoveMember(orgId);
  const manageSubscriptionMutation = useManageSubscription(orgId);
  const cancelSubscriptionMutation = useCancelOrgSubscription(orgId);
  const reactivateSubscriptionMutation = useReactivateOrgSubscription(orgId);
  const assignSeatMutation = useAssignSeat(orgId);
  const unassignSeatMutation = useUnassignSeat(orgId);
  const reassignSeatMutation = useReassignSeat(orgId);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("MEMBER");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [initialSeatCount, setInitialSeatCount] = useState(1);

  const handleCreateInvite = async (withEmail: boolean) => {
    try {
      const result = await createInvite({
        email: withEmail ? inviteEmail : undefined,
        role: inviteRole,
      });
      if (!withEmail) {
        setInviteLink(result.inviteUrl);
      } else {
        setInviteDialogOpen(false);
        setInviteEmail("");
      }
    } catch (error) {
      console.error("Failed to create invite:", error);
    }
  };

  const copyInviteLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleRoleChange = async (userId: string, newRole: OrganizationRole) => {
    try {
      await updateRoleMutation.mutateAsync({ userId, role: newRole });
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      await removeMemberMutation.mutateAsync(userId);
    } catch (error) {
      console.error("Failed to remove member:", error);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Are you sure you want to revoke this invite?")) return;
    try {
      await revokeInvite(inviteId);
    } catch (error) {
      console.error("Failed to revoke invite:", error);
    }
  };

  const handleManageSubscription = async (tier: "BYOK" | "CODE_REVIEW" | "TRIAGE", billing: "monthly" | "yearly", seatCount: number) => {
    setSubscriptionError(null);
    try {
      const result = await manageSubscriptionMutation.mutateAsync({ tier, billing, seatCount });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (error) {
      setSubscriptionError(error instanceof Error ? error.message : "Failed to manage subscription");
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel this subscription? All members will lose access at the end of the billing period.")) return;
    try {
      await cancelSubscriptionMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      await reactivateSubscriptionMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to reactivate subscription:", error);
    }
  };

  const handleAssignSeat = async (userId: string) => {
    try {
      await assignSeatMutation.mutateAsync(userId);
    } catch (error) {
      console.error("Failed to assign seat:", error);
    }
  };

  const handleUnassignSeat = async (userId: string) => {
    if (!confirm("Are you sure you want to unassign this seat? The user will lose access immediately.")) return;
    try {
      await unassignSeatMutation.mutateAsync(userId);
    } catch (error) {
      console.error("Failed to unassign seat:", error);
    }
  };

  const handleReassignSeat = async (sourceUserId: string, targetUserId: string) => {
    try {
      await reassignSeatMutation.mutateAsync({ sourceUserId, targetUserId });
    } catch (error) {
      console.error("Failed to reassign seat:", error);
    }
  };

  const assignedSeats = members.filter((m) => m.hasSeat).length;
  const membersWithoutSeat = members.filter((m) => !m.hasSeat);
  const availableSeats = (seatsInfo?.available ?? 0);

  const handleAvatarUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["organization"] });
    queryClient.invalidateQueries({ queryKey: ["organizations"] });
  };

  return (
    <div className="space-y-6">
      {/* Organization settings - for owners and admins */}
      {canUpdateOrg && (
        <OrganizationCard
          orgId={orgId}
          avatarUrl={orgDetails?.avatarUrl ?? null}
          orgName={currentOrg?.name ?? "Organization"}
          onUpdated={handleAvatarUpdated}
        />
      )}

      {/* Subscription & Quota Info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Organization Subscription</CardTitle>
            <CardDescription>Manage your team's subscription and seats</CardDescription>
          </div>
          {canManageBilling && (
            <SubscriptionBadge subscription={subscription} />
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription?.status === "ACTIVE" ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {tierLabels[subscription.tier]} Plan
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {assignedSeats} of {subscription.seatCount} seats assigned
                    {availableSeats > 0 && ` (${availableSeats} available)`}
                  </p>
                </div>
                {canManageBilling && (
                  <div className="flex gap-2">
                    {subscription.cancelAtPeriodEnd ? (
                      <Button size="sm" onClick={handleReactivateSubscription}>
                        Reactivate
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" onClick={handleCancelSubscription}>
                        Cancel subscription
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {quotaPool && (
                <div className="pt-4 border-t">
                  {quotaPool.hasUnlimited || quotaPool.total === -1 ? (
                    <p className="text-sm">Unlimited reviews (BYOK)</p>
                  ) : (
                    <>
                      <p className="text-sm">
                        {quotaPool.used} / {quotaPool.total} reviews used this cycle
                      </p>
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (quotaPool.used / quotaPool.total) * 100)}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">No active subscription</p>
              {canManageBilling && (
                <div className="flex flex-col gap-4 items-center">
                  <p className="text-sm">Choose a plan to get started:</p>

                  {/* Seat count selector */}
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setInitialSeatCount(Math.max(1, initialSeatCount - 1))}
                      disabled={initialSeatCount <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="flex flex-col items-center min-w-[60px]">
                      <span className="text-2xl font-semibold">{initialSeatCount}</span>
                      <span className="text-xs text-muted-foreground">{initialSeatCount === 1 ? "seat" : "seats"}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setInitialSeatCount(Math.min(100, initialSeatCount + 1))}
                      disabled={initialSeatCount >= 100}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleManageSubscription("BYOK", "monthly", initialSeatCount)}>
                      BYOK (${9 * initialSeatCount}/mo)
                    </Button>
                    <Button variant="outline" onClick={() => handleManageSubscription("CODE_REVIEW", "monthly", initialSeatCount)}>
                      Review (${19 * initialSeatCount}/mo)
                    </Button>
                    <Button onClick={() => handleManageSubscription("TRIAGE", "monthly", initialSeatCount)}>
                      Triage (${49 * initialSeatCount}/mo)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {subscriptionError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {subscriptionError}
        </div>
      )}

      {/* Seat Management - show when subscription is active */}
      {canManageBilling && subscription?.status === "ACTIVE" && (
        <SeatManagementCard
          orgId={orgId}
          subscription={subscription}
          seats={seatsInfo}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              {isLoadingMembers ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <>{assignedSeats} seats assigned, {members.length} members</>
              )}
            </CardDescription>
          </div>
          {canManageMembers && (
            <Dialog open={inviteDialogOpen} onOpenChange={(open) => {
              setInviteDialogOpen(open);
              if (!open) {
                setInviteEmail("");
                setInviteLink(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  Invite member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a new member</DialogTitle>
                  <DialogDescription>
                    Send an invite via email or create a shareable link.
                  </DialogDescription>
                </DialogHeader>

                {inviteLink ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Input value={inviteLink} readOnly className="font-mono text-sm" />
                      <Button variant="outline" size="icon" onClick={copyInviteLink}>
                        {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Share this link with the person you want to invite. It expires in 7 days.
                    </p>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => {
                        setInviteLink(null);
                        setInviteDialogOpen(false);
                      }}>
                        Done
                      </Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email address (optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="colleague@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={inviteRole}
                        onValueChange={(v) => setInviteRole(v as OrganizationRole)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="MEMBER">Member</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        Admins can manage members and repositories. Members can only view.
                      </p>
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreateInvite(false)}
                        disabled={isCreatingInvite}
                      >
                        <LinkIcon className="size-3" />
                        Create link
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleCreateInvite(true)}
                        disabled={isCreatingInvite || !inviteEmail}
                      >
                        {isCreatingInvite ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Mail className="size-3" />
                        )}
                        Send invite
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {isLoadingMembers ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 ml-auto" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead>Joined</TableHead>
                  {(canManageMembers || canManageBilling) && <TableHead className="w-[50px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isSelf = member.userId === user?.visitorId;
                  const hasSeat = member.hasSeat;

                  return (
                    <TableRow key={member.userId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <img
                            src={member.avatarUrl || undefined}
                            alt={member.login}
                            className="w-8 h-8 rounded-full"
                          />
                          <div>
                            <p className="font-medium">
                              {member.name || member.login}
                              {isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
                            </p>
                            <p className="text-sm text-muted-foreground">@{member.login}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant[member.role]}>
                          {formatRoleName(member.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <SeatBadge hasSeat={hasSeat} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </TableCell>
                      {(canManageMembers || canManageBilling) && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* Seat assignment - owners only */}
                              {canManageBilling && !hasSeat && availableSeats > 0 && (
                                <>
                                  <DropdownMenuItem onClick={() => handleAssignSeat(member.userId)}>
                                    Assign seat
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {(canManageBilling || canManageMembers) && hasSeat && (
                                <>
                                  {membersWithoutSeat.length > 0 && (
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>
                                        Reassign seat to...
                                      </DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent>
                                        {membersWithoutSeat.map((targetMember) => (
                                          <DropdownMenuItem
                                            key={targetMember.userId}
                                            onClick={() => handleReassignSeat(member.userId, targetMember.userId)}
                                          >
                                            {targetMember.name || targetMember.login}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                  )}
                                  <DropdownMenuItem
                                    className="text-orange-600"
                                    onClick={() => handleUnassignSeat(member.userId)}
                                  >
                                    Unassign seat
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {/* Role management */}
                              {canManageMembers && !isSelf && member.role !== "OWNER" && (
                                <DropdownMenuItem
                                  onClick={() => handleRoleChange(member.userId, member.role === "ADMIN" ? "MEMBER" : "ADMIN")}
                                >
                                  Make {member.role === "ADMIN" ? "Member" : "Admin"}
                                </DropdownMenuItem>
                              )}
                              {/* Remove member */}
                              {canManageMembers && !isSelf && member.role !== "OWNER" && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleRemoveMember(member.userId)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManageMembers && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invites</CardTitle>
            <CardDescription>
              Invites that haven't been accepted yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingInvites ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : invites.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No pending invites
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invite</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Invited by</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>
                        {invite.email || (
                          <span className="text-muted-foreground">Link invite</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant[invite.role]}>
                          {formatRoleName(invite.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invite.invitedBy}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRevokeInvite(invite.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Billing History - shown for owners and admins */}
      {(canManageBilling || canManageMembers) && (
        <BillingHistoryCard user={user} orgId={orgId} />
      )}
    </div>
  );
}

// ==================== MAIN SETTINGS PAGE ====================

type TabType = "general" | "organization" | "reviews" | "billing";

export function SettingsPage() {
  const { user, logout, setUser } = useAuth();
  const { currentOrgId, canManageMembers, canManageBilling } = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();

  // Check if user is a solo user (hide organization tab, show billing instead)
  const isSoloUser = user?.accountType === "SOLO";

  // Determine which tabs to show based on role
  const isMember = !canManageMembers && !canManageBilling;
  const isAdminOrOwner = canManageMembers || canManageBilling;

  // Solo users see billing instead of organization, even if they're an owner
  const showOrganizationTab = isAdminOrOwner && !isSoloUser;
  const showBillingTab = isMember || isSoloUser;

  // Build valid tabs based on role (reviews tab removed - now in sidebar)
  const validTabs: TabType[] = showOrganizationTab
    ? ["general", "organization"]
    : ["general", "billing"];

  const tabParam = searchParams.get("tab") as TabType | null;
  const activeTab: TabType = tabParam && validTabs.includes(tabParam) ? tabParam : validTabs[0];

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Settings</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          {showOrganizationTab && <TabsTrigger value="organization">Organization</TabsTrigger>}
          {showBillingTab && <TabsTrigger value="billing">Billing</TabsTrigger>}
        </TabsList>

        <TabsContent value="general">
          <GeneralTab user={user} logout={logout} orgId={currentOrgId} setUser={setUser} />
        </TabsContent>
        {showOrganizationTab && (
          <TabsContent value="organization">
            <OrganizationTab user={user} orgId={currentOrgId} />
          </TabsContent>
        )}
        {showBillingTab && (
          <TabsContent value="billing">
            <BillingTab user={user} orgId={currentOrgId} isSoloUser={isSoloUser} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
