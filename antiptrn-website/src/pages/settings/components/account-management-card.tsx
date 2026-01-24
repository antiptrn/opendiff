import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { useExportData, useDeleteAccount } from "@/hooks/use-api";

interface AccountManagementCardProps {
  token?: string;
  orgId?: string | null;
  logout: () => void;
}

/**
 * Card component for account management (export data, delete account)
 */
export function AccountManagementCard({ token, orgId, logout }: AccountManagementCardProps) {
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
          <div className="space-y-1">
            <p className="text-base">Export my data</p>
            <p className="text-sm text-muted-foreground">Download all your data as a JSON file.</p>
          </div>
          <Button variant="outline" onClick={handleExportData} disabled={exportData.isPending}>
            {exportData.isPending && <Loader2 className="size-4 animate-spin" />}
            {exportData.isPending ? "Exporting..." : "Export Data"}
          </Button>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-base text-destructive">Delete my account</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <Button
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
              Are you sure you want to delete your account? This action cannot be undone. All your
              data, settings, and subscription will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="default">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount} variant="destructive">
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
