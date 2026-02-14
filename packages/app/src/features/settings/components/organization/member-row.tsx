import { Avatar, AvatarFallback, AvatarImage } from "components/components/ui/avatar";
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
import { TableCell, TableRow } from "components/components/ui/table";
import { EllipsisVertical, Trash2 } from "lucide-react";
import type { OrganizationRole } from "shared/auth";
import { formatRoleName } from "shared/billing";
import { SeatBadge } from "./seat-badge";

export interface Member {
  userId: string;
  name: string | null;
  login: string;
  avatarUrl: string | null;
  role: OrganizationRole;
  hasSeat: boolean;
  joinedAt: string;
}

interface MemberRowProps {
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
 * A single row in the members table
 */
export function MemberRow({
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
}: MemberRowProps) {
  const hasSeat = member.hasSeat;
  const canAssignSeat = canManageBilling && !hasSeat && availableSeats > 0;
  const canManageSeat = (canManageBilling || canManageMembers) && hasSeat;
  const canManageRole = canManageMembers && !isSelf && member.role !== "OWNER";
  const hasDropdownItems = canAssignSeat || canManageSeat || canManageRole;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-6">
            <AvatarImage src={member.avatarUrl || undefined} alt={member.login} />
            <AvatarFallback className="text-3xl">{member.login.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <p>
              {member.name || member.login}
              {isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <p className="text-foreground">{formatRoleName(member.role)}</p>
      </TableCell>
      <TableCell>
        <SeatBadge hasSeat={hasSeat} />
      </TableCell>
      <TableCell className="text-foreground">
        {new Date(member.joinedAt).toLocaleDateString()}
      </TableCell>
      {(canManageMembers || canManageBilling) && (
        <TableCell className="text-right">
          {hasDropdownItems && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-md">
                  <EllipsisVertical className="size-4" />
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
                    <Trash2 className="size-4" />
                    Remove
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
