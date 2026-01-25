import { useState } from "react";
import { Button } from "@shared/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@shared/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { useLeaveOrganization } from "@modules/organizations";

interface LeaveOrganizationCardProps {
  orgId: string | null;
  orgName: string;
}

/**
 * Card component for leaving an organization
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
          <div className="space-y-1">
            <p className="text-base">Leave {orgName}</p>
            <p className="text-sm text-muted-foreground">
              You will lose access to this organization and its repositories.
            </p>
          </div>
          <Button
            variant="outline"
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
              Are you sure you want to leave {orgName}? You will lose access to this organization
              and all its repositories. You'll need to be re-invited to rejoin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleLeave} variant="outline">
              {leaveOrganization.isPending && <Loader2 className="size-4 animate-spin" />}
              Leave Organization
            </AlertDialogAction>
            <AlertDialogCancel variant="default">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
