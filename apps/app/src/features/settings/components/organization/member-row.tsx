import { Delete02Icon, EllipsisVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "components/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "components/components/ui/dropdown-menu";
import type { OrganizationRole } from "shared/auth";

export interface Member {
  userId: string;
  name: string | null;
  login: string;
  avatarUrl: string | null;
  role: OrganizationRole;
  hasSeat: boolean;
  joinedAt: string;
}

interface MemberActionsProps {
  member: Member;
  isSelf: boolean;
  canManageMembers: boolean;
  canManageBilling: boolean;
  availableSeats: number;
  membersWithoutSeat: Member[];
  onAssignSeat: (userId: string) => void;
  onUnassignSeat: (userId: string) => void;
  onReassignSeat: (sourceUserId: string, targetUserId: string) => void;
  onRoleChange: (userId: string, newRole: OrganizationRole) => void;
  onRemoveMember: (userId: string) => void;
}

/**
 * The members table's row menu: assign, reassign or unassign the member's seat, change their role,
 * or remove them. Renders nothing when the viewer can't do any of those for this member.
 */
export function MemberActions({
  member,
  isSelf,
  canManageMembers,
  canManageBilling,
  availableSeats,
  membersWithoutSeat,
  onAssignSeat,
  onUnassignSeat,
  onReassignSeat,
  onRoleChange,
  onRemoveMember,
}: MemberActionsProps) {
  const hasSeat = member.hasSeat;
  const canAssignSeat = canManageBilling && !hasSeat && availableSeats > 0;
  const canManageSeat = (canManageBilling || canManageMembers) && hasSeat;
  const canManageRole = canManageMembers && !isSelf && member.role !== "OWNER";
  const hasDropdownItems = canAssignSeat || canManageSeat || canManageRole;

  if (!hasDropdownItems) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Member actions">
          <HugeiconsIcon icon={EllipsisVerticalIcon} className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Seat assignment */}
        {canAssignSeat && (
          <>
            <DropdownMenuItem onClick={() => onAssignSeat(member.userId)}>
              Assign seat
            </DropdownMenuItem>
            {(canManageSeat || canManageRole) && <DropdownMenuSeparator />}
          </>
        )}
        {canManageSeat && (
          <>
            {membersWithoutSeat.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Reassign seat to...</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {membersWithoutSeat.map((targetMember) => (
                    <DropdownMenuItem
                      key={targetMember.userId}
                      onClick={() => onReassignSeat(member.userId, targetMember.userId)}
                    >
                      {targetMember.name || targetMember.login}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem
              className="text-orange-600"
              onClick={() => onUnassignSeat(member.userId)}
            >
              Unassign seat
            </DropdownMenuItem>
            {canManageRole && <DropdownMenuSeparator />}
          </>
        )}
        {/* Role management */}
        {canManageRole && (
          <DropdownMenuItem
            onClick={() =>
              onRoleChange(member.userId, member.role === "ADMIN" ? "MEMBER" : "ADMIN")
            }
          >
            Make {member.role === "ADMIN" ? "Member" : "Admin"}
          </DropdownMenuItem>
        )}
        {/* Remove member */}
        {canManageRole && (
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => onRemoveMember(member.userId)}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Remove
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
