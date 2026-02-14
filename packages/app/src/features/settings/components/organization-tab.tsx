import { useQueryClient } from "@tanstack/react-query";
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
import { Avatar, AvatarFallback, AvatarImage } from "components/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Skeleton } from "components/components/ui/skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "components/components/ui/table";
import { useMemo, useState } from "react";
import type { OrganizationRole, useAuth } from "shared/auth";
import { formatRoleName } from "shared/billing";
import {
  useAssignSeat,
  useOrganization,
  useOrganizationInvites,
  useOrganizationMembers,
  useReassignSeat,
  useRemoveMember,
  useUnassignSeat,
  useUpdateMemberRole,
} from "shared/organizations";
import { LeaveOrganizationCard } from "./leave-organization-card";
import {
  type Invite,
  InviteDialog,
  InviteLinkDialog,
  type Member,
  MemberRow,
  PendingInvitesCard,
} from "./organization";
import { OrganizationCard } from "./organization-card";

interface OrganizationTabProps {
  user: ReturnType<typeof useAuth>["user"];
  orgId: string | null;
}

/**
 * Organization tab - team profile, members, invites
 */
export function OrganizationTab({ user, orgId }: OrganizationTabProps) {
  const { orgDetails, canManageMembers, canManageBilling, canUpdateOrg, seats, currentOrg } =
    useOrganization();
  const queryClient = useQueryClient();
  const { data: membersData, isLoading: isLoadingMembers } = useOrganizationMembers(orgId);
  const members = (membersData?.members || []) as Member[];
  const seatsInfo = membersData?.seats || seats;

  const {
    invites: rawInvites,
    isLoading: isLoadingInvites,
    createInvite,
    isCreatingInvite,
    revokeInvite,
  } = useOrganizationInvites(orgId);
  const invites = rawInvites as Invite[];

  const updateRoleMutation = useUpdateMemberRole(orgId);
  const removeMemberMutation = useRemoveMember(orgId);
  const assignSeatMutation = useAssignSeat(orgId);
  const unassignSeatMutation = useUnassignSeat(orgId);
  const reassignSeatMutation = useReassignSeat(orgId);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteLinkDialogOpen, setInviteLinkDialogOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);

  const handleCreateInvite = async (email: string | undefined, role: OrganizationRole) => {
    try {
      const result = await createInvite({ email, role });
      if (!email) {
        setInviteLink(result.inviteUrl);
        setInviteDialogOpen(false);
        setInviteLinkDialogOpen(true);
      } else {
        setInviteDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to create invite:", error);
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

  const handleRevokeInviteClick = (inviteId: string) => {
    const invite = invites.find((i) => i.id === inviteId);
    if (!invite) return;
    setRevokeTarget(invite);
    setIsRevokeDialogOpen(true);
  };

  const handleRevokeInviteConfirm = async () => {
    if (!revokeTarget) return;
    const invitesToRevoke = revokeTarget.email
      ? invites.filter((i) => i.email === revokeTarget.email)
      : [revokeTarget];
    setIsRevokeDialogOpen(false);
    try {
      await Promise.all(invitesToRevoke.map((i) => revokeInvite(i.id)));
    } catch (error) {
      console.error("Failed to revoke invite:", error);
    }
  };

  // Deduplicate invites - keep most recent per email, but show all link invites
  const deduplicatedInvites = useMemo(() => {
    const emailInvites = new Map<string, Invite>();
    const linkInvites: Invite[] = [];

    for (const invite of invites) {
      if (invite.email) {
        const existing = emailInvites.get(invite.email);
        if (!existing || new Date(invite.expiresAt) > new Date(existing.expiresAt)) {
          emailInvites.set(invite.email, invite);
        }
      } else {
        linkInvites.push(invite);
      }
    }

    return [...emailInvites.values(), ...linkInvites];
  }, [invites]);

  const handleAssignSeat = async (userId: string) => {
    try {
      await assignSeatMutation.mutateAsync(userId);
    } catch (error) {
      console.error("Failed to assign seat:", error);
    }
  };

  const handleUnassignSeat = async (userId: string) => {
    if (
      !confirm(
        "Are you sure you want to unassign this seat? The user will lose access immediately."
      )
    )
      return;
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
  const availableSeats = seatsInfo?.available ?? 0;

  const handleAvatarUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["organization"] });
    queryClient.invalidateQueries({ queryKey: ["organizations"] });
  };

  return (
    <div className="space-y-6">
      {/* Organization settings - for owners and admins */}
      {canUpdateOrg ? (
        <OrganizationCard
          orgId={orgId}
          avatarUrl={orgDetails?.avatarUrl ?? null}
          orgName={currentOrg?.name ?? "Organization"}
          isOwner={orgDetails?.role === "OWNER"}
          isRegisteredBusiness={orgDetails?.isRegisteredBusiness ?? false}
          businessName={orgDetails?.businessName ?? null}
          taxVatId={orgDetails?.taxVatId ?? null}
          onUpdated={handleAvatarUpdated}
        />
      ) : (
        /* Read-only org info for members */
        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarImage
                  src={currentOrg?.avatarUrl ?? undefined}
                  alt={currentOrg?.name ?? ""}
                />
                <AvatarFallback className="text-3xl">
                  {currentOrg?.name?.charAt(0) ?? ""}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg">{currentOrg?.name}</p>
                <p className="text-base text-muted-foreground">
                  You are a {formatRoleName(currentOrg?.role ?? "MEMBER")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            {isLoadingMembers ? (
              <Skeleton muted className="h-5 w-48" />
            ) : (
              `${members.length} member${members.length === 1 ? "" : "s"}, ${assignedSeats} seat${assignedSeats === 1 ? "" : "s"} assigned`
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingMembers ? (
            <div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 h-14 border-b last:border-0">
                  <Skeleton muted className="size-6 rounded-full" />
                  <Skeleton muted className="h-6 w-32 rounded-md" />
                  <Skeleton muted className="h-6 w-16 rounded-md" />
                  <Skeleton muted className="h-6 w-14 rounded-md" />
                  <Skeleton muted className="h-6 w-20 rounded-md" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Member</TableHead>
                  <TableHead className="w-[15%]">Role</TableHead>
                  <TableHead className="w-[15%]">Seat</TableHead>
                  <TableHead className="w-[20%]">Joined</TableHead>
                  {(canManageMembers || canManageBilling) && <TableHead className="w-[10%]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    isSelf={member.userId === user?.visitorId}
                    canManageMembers={canManageMembers}
                    canManageBilling={canManageBilling}
                    availableSeats={availableSeats}
                    membersWithoutSeat={membersWithoutSeat}
                    onAssignSeat={handleAssignSeat}
                    onUnassignSeat={handleUnassignSeat}
                    onReassignSeat={handleReassignSeat}
                    onRoleChange={handleRoleChange}
                    onRemoveMember={handleRemoveMember}
                  />
                ))}
              </TableBody>
            </Table>
          )}

          {canManageMembers && (
            <>
              <InviteDialog
                open={inviteDialogOpen}
                onOpenChange={setInviteDialogOpen}
                onCreateInvite={handleCreateInvite}
                isCreating={isCreatingInvite}
              />
              <InviteLinkDialog
                open={inviteLinkDialogOpen}
                onOpenChange={(open) => {
                  setInviteLinkDialogOpen(open);
                  if (!open) setInviteLink(null);
                }}
                inviteLink={inviteLink}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {canManageMembers && (
        <PendingInvitesCard
          invites={deduplicatedInvites}
          isLoading={isLoadingInvites}
          onRevokeInvite={handleRevokeInviteClick}
        />
      )}

      {/* Revoke Invite Confirmation */}
      <AlertDialog open={isRevokeDialogOpen} onOpenChange={setIsRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invite</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.email
                ? invites.filter((i) => i.email === revokeTarget.email).length > 1
                  ? `Are you sure you want to revoke all invites to ${revokeTarget.email}?`
                  : `Are you sure you want to revoke the invite to ${revokeTarget.email}?`
                : "Are you sure you want to revoke this invite link?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant="outline" onClick={handleRevokeInviteConfirm}>
              Revoke
            </AlertDialogAction>
            <AlertDialogCancel variant="default">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Organization - shown for non-owners */}
      {currentOrg?.role !== "OWNER" && (
        <LeaveOrganizationCard orgId={orgId} orgName={currentOrg?.name ?? "Organization"} />
      )}
    </div>
  );
}
