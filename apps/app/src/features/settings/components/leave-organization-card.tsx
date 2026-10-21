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
import { LoadingButton } from "components/components/ui/loading-button";
import { useState } from "react";
import { useLeaveOrganization } from "shared/organizations";
import { toast } from "sonner";

interface LeaveOrganizationCardProps {
  orgId: string | null;
  orgName: string;
}

/**
 * Danger zone setting for leaving an organization
 */
export function LeaveOrganizationCard({ orgId, orgName }: LeaveOrganizationCardProps) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const leaveOrganization = useLeaveOrganization(orgId);

  const handleLeave = async () => {
    try {
      await leaveOrganization.mutateAsync();
      setShowLeaveDialog(false);
      // The organization queries will be invalidated and the user will be redirected
      // to create-organization if they have no orgs left
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to leave organization");
    }
  };

  return (
    <SettingsSection title="Danger zone" variant="danger">
      <SettingsRow
        title={`Leave ${orgName}`}
        description="You'll lose access to this team and its repositories."
      >
        <LoadingButton
          variant="destructive"
          onClick={() => setShowLeaveDialog(true)}
          isLoading={leaveOrganization.isPending}
        >
          Leave team
        </LoadingButton>
      </SettingsRow>

      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave {orgName}? You will lose access to this organization
              and all its repositories. You'll need to be re-invited to rejoin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleLeave} variant="outline">
              {leaveOrganization.isPending && (
                <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
              )}
              Leave Organization
            </AlertDialogAction>
            <AlertDialogCancel variant="default">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
