import { useDeleteAccount, useExportData } from "@/features/settings";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { SettingsRow, SettingsSection } from "components/components/console";
import { Button } from "components/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface AccountManagementSectionsProps {
  token?: string;
  orgId?: string | null;
  logout: () => void;
}

/**
 * Account management settings: exporting data, and deleting the account in the danger zone
 */
export function AccountManagementSections({
  token,
  orgId,
  logout,
}: AccountManagementSectionsProps) {
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
    <>
      <SettingsSection title="Data">
        <SettingsRow title="Export my data" description="Download all your data as a JSON file.">
          <Button variant="outline" onClick={handleExportData} disabled={exportData.isPending}>
            {exportData.isPending && (
              <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
            )}
            {exportData.isPending ? "Exporting..." : "Export data"}
          </Button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Danger zone" variant="danger">
        <SettingsRow
          title="Delete account"
          description="Permanently delete your account and all your data. This can't be undone."
        >
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteAccount.isPending}
          >
            {deleteAccount.isPending && (
              <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
            )}
            {deleteAccount.isPending ? "Deleting..." : "Delete account"}
          </Button>
        </SettingsRow>
      </SettingsSection>

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
    </>
  );
}
