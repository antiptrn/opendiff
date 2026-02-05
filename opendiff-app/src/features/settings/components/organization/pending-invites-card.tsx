import { Trash2 } from "lucide-react";
import { Button } from "opendiff-components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "opendiff-components/components/ui/card";
import { Skeleton } from "opendiff-components/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "opendiff-components/components/ui/table";
import { formatRoleName } from "opendiff-components/utils";
import type { OrganizationRole } from "opendiff-shared/auth";

export interface Invite {
  id: string;
  email: string | null;
  role: OrganizationRole;
  invitedBy: string;
  expiresAt: string;
}

interface PendingInvitesCardProps {
  invites: Invite[];
  isLoading: boolean;
  onRevokeInvite: (inviteId: string) => void;
}

/**
 * Card showing pending team invites
 */
export function PendingInvitesCard({
  invites,
  isLoading,
  onRevokeInvite,
}: PendingInvitesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Invites</CardTitle>
        <CardDescription>Invites that haven't been accepted yet</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 h-14 border-b last:border-0">
                <Skeleton muted className="h-6 w-40 rounded-md" />
                <Skeleton muted className="h-6 w-16 rounded-md" />
                <Skeleton muted className="h-6 w-24 rounded-md" />
                <Skeleton muted className="h-6 w-20 rounded-md" />
                <Skeleton muted className="size-9 rounded-full ml-auto" />
              </div>
            ))}
          </div>
        ) : invites.length === 0 ? (
          <p className="text-base text-muted-foreground text-center pb-4 mt-4">
            No pending invites
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Invite</TableHead>
                <TableHead className="w-[15%]">Role</TableHead>
                <TableHead className="w-[20%]">Invited by</TableHead>
                <TableHead className="w-[20%]">Expires</TableHead>
                <TableHead className="w-[10%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell>
                    {invite.email || <span className="text-muted-foreground">Link invite</span>}
                  </TableCell>
                  <TableCell>
                    <p className="text-foreground">{formatRoleName(invite.role)}</p>
                  </TableCell>
                  <TableCell className="text-foreground">{invite.invitedBy}</TableCell>
                  <TableCell className="text-foreground">
                    {new Date(invite.expiresAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="icon" onClick={() => onRevokeInvite(invite.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
