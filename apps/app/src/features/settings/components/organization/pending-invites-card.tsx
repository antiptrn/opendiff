import { Delete02Icon } from "@hugeicons/core-free-icons";
import { TableEmpty } from "@/components/paginated-table";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "components/components/ui/button";
import { SettingsSection } from "components/components/console";
import { DataTable } from "components/components/ui/data-table";
import type { OrganizationRole } from "shared/auth";
import { formatRoleName } from "shared/billing";

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
    <SettingsSection
      title="Pending invites"
      description="Invites that haven't been accepted yet"
      fullBleed
    >
      <div>
        {!isLoading && invites.length === 0 ? (
          <TableEmpty
            title="No pending invites"
            description="Invites you send show up here until they're accepted."
          />
        ) : (
          <DataTable
            loading={isLoading}
            skeletonRows={3}
            label="Pending invites"
            rows={invites}
            getKey={(invite) => invite.id}
            columns={[
              {
                key: "invite",
                header: "Invite",
                cell: (invite) =>
                  invite.email || <span className="text-muted-foreground">Link invite</span>,
              },
              { key: "role", header: "Role", cell: (invite) => formatRoleName(invite.role) },
              { key: "invitedBy", header: "Invited by", cell: (invite) => invite.invitedBy },
              {
                key: "expires",
                header: "Expires",
                cell: (invite) => new Date(invite.expiresAt).toLocaleDateString(),
              },
              {
                key: "revoke",
                header: <span className="sr-only">Revoke</span>,
                className: "w-12",
                cell: (invite) => (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Revoke invite"
                    onClick={() => onRevokeInvite(invite.id)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4 text-destructive" />
                  </Button>
                ),
              },
            ]}
          />
        )}
      </div>
    </SettingsSection>
  );
}
