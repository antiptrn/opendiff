import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Copy,
  Check,
  Trash2,
  MoreHorizontal,
  Mail,
  Link as LinkIcon,
  Minus,
  Plus,
  Building2,
} from "lucide-react";
import type { useAuth, OrganizationRole } from "@/hooks/use-auth";
import {
  useOrganization,
  useOrganizationMembers,
  useOrganizationInvites,
  useUpdateMemberRole,
  useRemoveMember,
  useManageSubscription,
  useCancelSubscription,
  useReactivateSubscription,
  useAssignSeat,
  useUnassignSeat,
  useReassignSeat,
} from "@/hooks/use-organization";
import { OrganizationCard } from "./organization-card";
import { SeatManagementCard } from "./seat-management-card";
import { BillingHistoryCard } from "./billing-history-card";
import { LeaveOrganizationCard } from "./leave-organization-card";
import { formatRoleName, tierLabels } from "../utils";
import type { OrgSubscription } from "@/hooks/use-organization";

// Role badge variants
const roleBadgeVariant: Record<OrganizationRole, "default" | "secondary" | "outline"> = {
  OWNER: "secondary",
  ADMIN: "secondary",
  MEMBER: "secondary",
};

function SeatBadge({ hasSeat }: { hasSeat: boolean }) {
  if (!hasSeat) {
    return <span className="text-sm text-muted-foreground">No seat</span>;
  }
  return (
    <Badge
      variant="secondary"
      className="bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400"
    >
      Seat assigned
    </Badge>
  );
}

function SubscriptionBadge({ subscription }: { subscription: OrgSubscription | null }) {
  if (!subscription || !subscription.tier) {
    return <span className="text-sm text-muted-foreground">No subscription</span>;
  }

  const tierLabel = tierLabels[subscription.tier] || subscription.tier;

  if (subscription.cancelAtPeriodEnd) {
    return (
      <Badge
        variant="secondary"
        className="bg-orange-600/10 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400"
      >
        Cancelling
      </Badge>
    );
  }

  if (subscription.status !== "ACTIVE") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {tierLabel} - {subscription.status}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary">
      {tierLabel} ({subscription.seatCount} seats)
    </Badge>
  );
}

interface OrganizationTabProps {
  user: ReturnType<typeof useAuth>["user"];
  orgId: string | null;
}

/**
 * Organization tab - team profile, subscription, members, invites
 */
export function OrganizationTab({ user, orgId }: OrganizationTabProps) {
  const {
    orgDetails,
    canManageMembers,
    canManageBilling,
    canUpdateOrg,
    subscription,
    seats,
    currentOrg,
  } = useOrganization();
  const queryClient = useQueryClient();
  const { data: membersData, isLoading: isLoadingMembers } = useOrganizationMembers(orgId);
  const members = membersData?.members || [];
  const quotaPool = membersData?.quotaPool || orgDetails?.quotaPool;
  const seatsInfo = membersData?.seats || seats;

  const {
    invites,
    isLoading: isLoadingInvites,
    createInvite,
    isCreatingInvite,
    revokeInvite,
  } = useOrganizationInvites(orgId);
  const updateRoleMutation = useUpdateMemberRole(orgId);
  const removeMemberMutation = useRemoveMember(orgId);
  const manageSubscriptionMutation = useManageSubscription(orgId);
  const cancelSubscriptionMutation = useCancelSubscription(orgId);
  const reactivateSubscriptionMutation = useReactivateSubscription(orgId);
  const assignSeatMutation = useAssignSeat(orgId);
  const unassignSeatMutation = useUnassignSeat(orgId);
  const reassignSeatMutation = useReassignSeat(orgId);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("MEMBER");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [initialSeatCount, setInitialSeatCount] = useState(1);

  const handleCreateInvite = async (withEmail: boolean) => {
    try {
      const result = await createInvite({
        email: withEmail ? inviteEmail : undefined,
        role: inviteRole,
      });
      if (!withEmail) {
        setInviteLink(result.inviteUrl);
      } else {
        setInviteDialogOpen(false);
        setInviteEmail("");
      }
    } catch (error) {
      console.error("Failed to create invite:", error);
    }
  };

  const copyInviteLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
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

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Are you sure you want to revoke this invite?")) return;
    try {
      await revokeInvite(inviteId);
    } catch (error) {
      console.error("Failed to revoke invite:", error);
    }
  };

  const handleManageSubscription = async (
    tier: "BYOK" | "CODE_REVIEW" | "TRIAGE",
    billing: "monthly" | "yearly",
    seatCount: number
  ) => {
    setSubscriptionError(null);
    try {
      const result = await manageSubscriptionMutation.mutateAsync({ tier, billing, seatCount });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (error) {
      setSubscriptionError(
        error instanceof Error ? error.message : "Failed to manage subscription"
      );
    }
  };

  const handleCancelSubscription = async () => {
    if (
      !confirm(
        "Are you sure you want to cancel this subscription? All members will lose access at the end of the billing period."
      )
    )
      return;
    try {
      await cancelSubscriptionMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      await reactivateSubscriptionMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to reactivate subscription:", error);
    }
  };

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
              {orgDetails?.avatarUrl ? (
                <img
                  src={orgDetails.avatarUrl}
                  alt={currentOrg?.name}
                  className="size-16 rounded-full object-cover"
                />
              ) : (
                <div className="size-16 rounded-full bg-muted flex items-center justify-center">
                  <Building2 className="size-8 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="text-lg">{currentOrg?.name}</p>
                <p className="text-sm text-muted-foreground">
                  You are a {formatRoleName(currentOrg?.role ?? "MEMBER")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription & Quota Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Team Subscription</CardTitle>
            {canManageBilling && <SubscriptionBadge subscription={subscription} />}
          </div>
          <CardDescription>Manage your team's subscription and seats</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription?.status === "ACTIVE" ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base">{tierLabels[subscription.tier]} Plan</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {assignedSeats} of {subscription.seatCount} seats assigned
                    {availableSeats > 0 && ` (${availableSeats} available)`}
                  </p>
                </div>
                {canManageBilling && (
                  <div className="flex gap-2">
                    {subscription.cancelAtPeriodEnd ? (
                      <Button onClick={handleReactivateSubscription}>Reactivate</Button>
                    ) : (
                      <Button variant="destructive" onClick={handleCancelSubscription}>
                        Cancel subscription
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {quotaPool && (
                <div className="pt-4 border-t">
                  {quotaPool.hasUnlimited || quotaPool.total === -1 ? (
                    <p className="text-base">Unlimited reviews (BYOK)</p>
                  ) : (
                    <>
                      <p className="text-base">
                        {quotaPool.used} / {quotaPool.total} reviews used this cycle
                      </p>
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (quotaPool.used / quotaPool.total) * 100)}%`,
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">No active subscription</p>
              {canManageBilling && (
                <div className="flex flex-col gap-4 items-center">
                  <p className="text-sm">Choose a plan to get started:</p>

                  {/* Seat count selector */}
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setInitialSeatCount(Math.max(1, initialSeatCount - 1))}
                      disabled={initialSeatCount <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="flex flex-col items-center min-w-[60px]">
                      <span className="text-2xl font-semibold">{initialSeatCount}</span>
                      <span className="text-xs text-muted-foreground">
                        {initialSeatCount === 1 ? "seat" : "seats"}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setInitialSeatCount(Math.min(100, initialSeatCount + 1))}
                      disabled={initialSeatCount >= 100}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleManageSubscription("BYOK", "monthly", initialSeatCount)}
                    >
                      BYOK (${9 * initialSeatCount}/mo)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleManageSubscription("CODE_REVIEW", "monthly", initialSeatCount)
                      }
                    >
                      Review (${19 * initialSeatCount}/mo)
                    </Button>
                    <Button
                      onClick={() =>
                        handleManageSubscription("TRIAGE", "monthly", initialSeatCount)
                      }
                    >
                      Triage (${49 * initialSeatCount}/mo)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {subscriptionError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {subscriptionError}
        </div>
      )}

      {/* Seat Management - show when subscription is active */}
      {canManageBilling && subscription?.status === "ACTIVE" && (
        <SeatManagementCard orgId={orgId} subscription={subscription} seats={seatsInfo} />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              {isLoadingMembers ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <>
                  {assignedSeats} seats assigned, {members.length} members
                </>
              )}
            </CardDescription>
          </div>
          {canManageMembers && (
            <Dialog
              open={inviteDialogOpen}
              onOpenChange={(open) => {
                setInviteDialogOpen(open);
                if (!open) {
                  setInviteEmail("");
                  setInviteLink(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">Invite member</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a new member</DialogTitle>
                  <DialogDescription>
                    Send an invite via email or create a shareable link.
                  </DialogDescription>
                </DialogHeader>

                {inviteLink ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Input value={inviteLink} readOnly className="font-mono text-sm" />
                      <Button variant="outline" size="icon" onClick={copyInviteLink}>
                        {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Share this link with the person you want to invite. It expires in 7 days.
                    </p>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setInviteLink(null);
                          setInviteDialogOpen(false);
                        }}
                      >
                        Done
                      </Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email address (optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="colleague@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={inviteRole}
                        onValueChange={(v) => setInviteRole(v as OrganizationRole)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="MEMBER">Member</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        Admins can manage members and repositories. Members can only view.
                      </p>
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreateInvite(false)}
                        disabled={isCreatingInvite}
                      >
                        <LinkIcon className="size-3" />
                        Create link
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleCreateInvite(true)}
                        disabled={isCreatingInvite || !inviteEmail}
                      >
                        {isCreatingInvite ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Mail className="size-3" />
                        )}
                        Send invite
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {isLoadingMembers ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 ml-auto" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead>Joined</TableHead>
                  {(canManageMembers || canManageBilling) && <TableHead className="w-[50px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isSelf = member.userId === user?.visitorId;
                  const hasSeat = member.hasSeat;

                  return (
                    <TableRow key={member.userId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <img
                            src={member.avatarUrl || undefined}
                            alt={member.login}
                            className="w-8 h-8 rounded-full"
                          />
                          <div>
                            <p className="font-medium">
                              {member.name || member.login}
                              {isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
                            </p>
                            <p className="text-sm text-muted-foreground">@{member.login}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant[member.role]}>
                          {formatRoleName(member.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <SeatBadge hasSeat={hasSeat} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </TableCell>
                      {(canManageMembers || canManageBilling) && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* Seat assignment - owners only */}
                              {canManageBilling && !hasSeat && availableSeats > 0 && (
                                <>
                                  <DropdownMenuItem onClick={() => handleAssignSeat(member.userId)}>
                                    Assign seat
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {(canManageBilling || canManageMembers) && hasSeat && (
                                <>
                                  {membersWithoutSeat.length > 0 && (
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>
                                        Reassign seat to...
                                      </DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent>
                                        {membersWithoutSeat.map((targetMember) => (
                                          <DropdownMenuItem
                                            key={targetMember.userId}
                                            onClick={() =>
                                              handleReassignSeat(member.userId, targetMember.userId)
                                            }
                                          >
                                            {targetMember.name || targetMember.login}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                  )}
                                  <DropdownMenuItem
                                    className="text-orange-600"
                                    onClick={() => handleUnassignSeat(member.userId)}
                                  >
                                    Unassign seat
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {/* Role management */}
                              {canManageMembers && !isSelf && member.role !== "OWNER" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleRoleChange(
                                      member.userId,
                                      member.role === "ADMIN" ? "MEMBER" : "ADMIN"
                                    )
                                  }
                                >
                                  Make {member.role === "ADMIN" ? "Member" : "Admin"}
                                </DropdownMenuItem>
                              )}
                              {/* Remove member */}
                              {canManageMembers && !isSelf && member.role !== "OWNER" && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleRemoveMember(member.userId)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManageMembers && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invites</CardTitle>
            <CardDescription>Invites that haven't been accepted yet</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingInvites ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : invites.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No pending invites</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invite</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Invited by</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>
                        {invite.email || <span className="text-muted-foreground">Link invite</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant[invite.role]}>
                          {formatRoleName(invite.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{invite.invitedBy}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRevokeInvite(invite.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Billing History - shown for owners and admins */}
      {(canManageBilling || canManageMembers) && <BillingHistoryCard user={user} orgId={orgId} />}

      {/* Leave Organization - shown for non-owners */}
      {currentOrg?.role !== "OWNER" && (
        <LeaveOrganizationCard orgId={orgId} orgName={currentOrg?.name ?? "Organization"} />
      )}
    </div>
  );
}
