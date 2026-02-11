import { useDeleteAccount, useExportData } from "@/features/settings";
import { Loader2 } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "components/components/ui/card";
import { Separator } from "components/components/ui/separator";
import { useState } from "react";
import { toast } from "sonner";

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

  const exportData = useExportData(token, orgId);
  const deleteAccount = useDeleteAccount(token);

  const handleExportData = async () => {
    try {
      const data = await exportData.mutateAsync();
      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `opendiff-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Data exported successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export data");
    }
  };

  const handleDeleteAccount = async () => {
    setShowDeleteDialog(false);
    try {
      await deleteAccount.mutateAsync();
      logout();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <p className="text-base">Delete my account</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <Button
            variant="outline"
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
            <AlertDialogAction variant="outline" onClick={handleDeleteAccount}>
              Delete Account
            </AlertDialogAction>
            <AlertDialogCancel variant="default">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
