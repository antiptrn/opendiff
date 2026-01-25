import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import type { OrganizationRole, SubscriptionTier, useAuth } from "@features/auth";
import { PlanCard, plans } from "@features/billing";
import type { OrgSubscription } from "@modules/organizations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@shared/components/ui/alert-dialog";
import {
  useAssignSeat,
  useCancelOrgSubscription,
  useManageSubscription,
  useOrganization,
  useOrganizationInvites,
  useOrganizationMembers,
  useReactivateSubscription,
  useReassignSeat,
  useRemoveMember,
  useUnassignSeat,
  useUpdateMemberRole,
} from "@modules/organizations";
import { Badge } from "@shared/components/ui/badge";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import { Input } from "@shared/components/ui/input";
import { Label } from "@shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs";
import { Skeleton } from "@shared/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  EllipsisVertical,
  Link as LinkIcon,
  Loader2,
  Mail,
  Minus,
  Plus,
  Trash2
} from "lucide-react";
import NumberFlow from "@number-flow/react";
import { useState, useRef, useMemo } from "react";
import { formatDate, formatRoleName, tierLabels } from "../lib/utils";
import { Separator } from "@shared/components/ui/separator";
import { BillingHistoryCard } from "./billing-history-card";
import { LeaveOrganizationCard } from "./leave-organization-card";
import { OrganizationCard } from "./organization-card";
import { SeatManagementCard } from "./seat-management-card";

function SeatBadge({ hasSeat }: { hasSeat: boolean }) {
  if (!hasSeat) {
    return <span className="text-base text-muted-foreground">No seat</span>;
  }
  return (
    <p
      className="text-green-600 dark:text-green-400"
    >
      Assigned
    </p>
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
  const cancelSubscriptionMutation = useCancelOrgSubscription(orgId);
  const reactivateSubscriptionMutation = useReactivateSubscription(orgId);
  const assignSeatMutation = useAssignSeat(orgId);
  const unassignSeatMutation = useUnassignSeat(orgId);
  const reassignSeatMutation = useReassignSeat(orgId);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteLinkDialogOpen, setInviteLinkDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("MEMBER");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [initialSeatCount, setInitialSeatCount] = useState(1);
  const [isYearly, setIsYearly] = useState(true);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const handleCreateInvite = async (withEmail: boolean) => {
    try {
      const result = await createInvite({
        email: withEmail ? inviteEmail : undefined,
        role: inviteRole,
      });
      if (!withEmail) {
        setInviteLink(result.inviteUrl);
        setInviteDialogOpen(false);
        setInviteLinkDialogOpen(true);
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
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopiedLink(false), 2000);
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
    const invite = invites.find((i) => i.id === inviteId);
    if (!invite) return;

    // Find all invites with the same email (if it has one)
    const invitesToRevoke = invite.email
      ? invites.filter((i) => i.email === invite.email)
      : [invite];

    const message =
      invitesToRevoke.length > 1
        ? `Are you sure you want to revoke all ${invitesToRevoke.length} invites to ${invite.email}?`
        : "Are you sure you want to revoke this invite?";

    if (!confirm(message)) return;
    try {
      await Promise.all(invitesToRevoke.map((i) => revokeInvite(i.id)));
    } catch (error) {
      console.error("Failed to revoke invite:", error);
    }
  };

  // Deduplicate invites - keep most recent per email, but show all link invites
  const deduplicatedInvites = useMemo(() => {
    const emailInvites = new Map<string, (typeof invites)[0]>();
    const linkInvites: typeof invites = [];

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
    try {
      await cancelSubscriptionMutation.mutateAsync();
      setShowCancelDialog(false);
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
              <Avatar className="size-16 rounded-xl overflow-hidden">
                <AvatarImage src={currentOrg?.avatarUrl ?? undefined} alt={currentOrg?.name ?? ""} />
                <AvatarFallback className="text-3xl">{currentOrg?.name?.charAt(0) ?? ""}</AvatarFallback>
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

      {/* Subscription & Quota Info */}
      <Card>
        <CardHeader>
          <CardTitle>Team Subscription</CardTitle>
          <CardDescription>Manage your team's subscription and seats</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription?.status === "ACTIVE" ? (
            <>
              <dl className="text-sm">
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground text-base">Status</dt>
                  <dd>
                    {subscription.cancelAtPeriodEnd ? (
                      <span className="text-orange-600 dark:text-orange-400">Cancelling</span>
                    ) : (
                      <span className="text-green-600 dark:text-green-400">Active</span>
                    )}
                  </dd>
                </div>
                <Separator className="my-4" />
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground text-base">Plan</dt>
                  <dd>{tierLabels[subscription.tier]}</dd>
                </div>
                <Separator className="my-4" />
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground text-base">Seats</dt>
                  <dd>
                    {assignedSeats} of {subscription.seatCount} assigned
                    {availableSeats > 0 && ` (${availableSeats} available)`}
                  </dd>
                </div>
                {subscription.expiresAt && (
                  <>
                    <Separator className="my-4" />
                    <div className="flex justify-between items-center">
                      <dt className="text-muted-foreground text-base">
                        {subscription.cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                      </dt>
                      <dd>{formatDate(subscription.expiresAt)}</dd>
                    </div>
                  </>
                )}
              </dl>
              {quotaPool && (
                <div className="pt-4 border-t">
                  {quotaPool.hasUnlimited || quotaPool.total === -1 ? (
                    <p className="text-base">Unlimited reviews (BYOK)</p>
                  ) : (
                    <>
                      <p className="text-sm">
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
              {canManageBilling && (
                <div className="flex gap-2 mt-6">
                  {subscription.cancelAtPeriodEnd ? (
                    <Button onClick={handleReactivateSubscription}>Reactivate</Button>
                  ) : (
                    <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline">Cancel subscription</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                          <AlertDialogDescription>
                            All members will lose access at the end of the current billing period. You can reactivate anytime before then.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogAction variant="outline" onClick={handleCancelSubscription}>
                            Cancel Subscription
                          </AlertDialogAction>
                          <AlertDialogCancel variant="default">Keep Subscription</AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )}
            </>
          ) : (
            <div>
              <p className="text-base text-muted-foreground pb-4">
                No active subscription
              </p>
              {canManageBilling && (
                <div className="flex flex-col gap-6">
                  {/* Billing cycle and seat count */}
                  <div className="flex items-center justify-between">
                    <Tabs
                      value={isYearly ? "yearly" : "monthly"}
                      onValueChange={(value) => setIsYearly(value === "yearly")}
                    >
                      <TabsList>
                        <TabsTrigger value="monthly">Monthly</TabsTrigger>
                        <TabsTrigger value="yearly">Yearly</TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {/* Seat count selector */}
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => setInitialSeatCount(Math.max(1, initialSeatCount - 1))}
                        disabled={initialSeatCount <= 1}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <div className="flex items-baseline gap-1.5 min-w-[60px] justify-center">
                        <NumberFlow
                          value={initialSeatCount}
                          className="text-xl font-semibold"
                        />
                        <span className="text-sm text-muted-foreground">
                          {initialSeatCount === 1 ? "seat" : "seats"}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => setInitialSeatCount(Math.min(100, initialSeatCount + 1))}
                        disabled={initialSeatCount >= 100}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Plan cards */}
                  <div className="grid md:grid-cols-3 gap-4">
                    {plans.map((plan) => (
                      <PlanCard
                        key={plan.tier}
                        plan={plan}
                        isYearly={isYearly}
                        seatCount={initialSeatCount}
                        buttonText="Checkout"
                        roundedButton={false}
                        onGetStarted={(tier) => {
                          setSelectedTier(tier);
                          handleManageSubscription(
                            tier as "BYOK" | "CODE_REVIEW" | "TRIAGE",
                            isYearly ? "yearly" : "monthly",
                            initialSeatCount
                          );
                        }}
                        isLoading={manageSubscriptionMutation.isPending && selectedTier === plan.tier}
                        disabled={manageSubscriptionMutation.isPending}
                      />
                    ))}
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
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            {isLoadingMembers ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              `${members.length} member${members.length === 1 ? "" : "s"}, ${assignedSeats} seat${assignedSeats === 1 ? "" : "s"} assigned`
            )}
          </CardDescription>
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
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-normal text-muted-foreground w-[40%]">Member</th>
                    <th className="pb-2 font-normal text-muted-foreground w-[15%]">Role</th>
                    <th className="pb-2 font-normal text-muted-foreground w-[15%]">Seat</th>
                    <th className="pb-2 font-normal text-muted-foreground w-[20%]">Joined</th>
                    {(canManageMembers || canManageBilling) && <th className="pb-2 w-[10%]" />}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isSelf = member.userId === user?.visitorId;
                    const hasSeat = member.hasSeat;
                    const canAssignSeat = canManageBilling && !hasSeat && availableSeats > 0;
                    const canManageSeat = (canManageBilling || canManageMembers) && hasSeat;
                    const canManageRole = canManageMembers && !isSelf && member.role !== "OWNER";
                    const hasDropdownItems = canAssignSeat || canManageSeat || canManageRole;

                    return (
                      <tr key={member.userId} className="border-b last:border-0">
                        <td className="h-14 text-sm">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-6 rounded-sm overflow-hidden">
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
                        </td>
                        <td className="h-14 text-sm">
                          <p className="text-foreground">
                            {formatRoleName(member.role)}
                          </p>
                        </td>
                        <td className="h-14 text-sm">
                          <SeatBadge hasSeat={hasSeat} />
                        </td>
                        <td className="h-14 text-sm text-foreground">
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </td>
                        {(canManageMembers || canManageBilling) && (
                          <td className="h-14 text-right">
                            {hasDropdownItems && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="rounded-md">
                                    <EllipsisVertical className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {/* Seat assignment - owners only */}
                                  {canAssignSeat && (
                                    <>
                                      <DropdownMenuItem onClick={() => handleAssignSeat(member.userId)}>
                                        Assign seat
                                      </DropdownMenuItem>
                                      {(canManageSeat || canManageRole) && <DropdownMenuSeparator />}
                                    </>
                                  )}
                                  {canManageSeat && (
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
                                      {canManageRole && <DropdownMenuSeparator />}
                                    </>
                                  )}
                                  {/* Role management */}
                                  {canManageRole && (
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
                                  {canManageRole && (
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => handleRemoveMember(member.userId)}
                                    >
                                      <Trash2 className="size-4" />
                                      Remove
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {canManageMembers && (
            <>
              <Dialog
                open={inviteDialogOpen}
                onOpenChange={(open) => {
                  setInviteDialogOpen(open);
                  if (!open) {
                    setInviteEmail("");
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button className="mt-4">Invite member</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite a new member</DialogTitle>
                    <DialogDescription>
                      Send an invite via email or create a shareable link.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 mt-2">
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
                      <p className="text-sm text-muted-foreground mt-4">
                        Admins can manage members and repositories while members can only view.
                      </p>
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleCreateInvite(false)}
                        disabled={isCreatingInvite}
                      >
                        {isCreatingInvite && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        {isCreatingInvite ? "Creating..." : "Create link"}
                      </Button>
                      <Button
                        onClick={() => handleCreateInvite(true)}
                        disabled={isCreatingInvite || !inviteEmail}
                      >
                        {isCreatingInvite && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        Send invite
                      </Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Invite Link Dialog */}
              <Dialog
                open={inviteLinkDialogOpen}
                onOpenChange={(open) => {
                  setInviteLinkDialogOpen(open);
                  if (!open) {
                    setInviteLink(null);
                    setCopiedLink(false);
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite link created</DialogTitle>
                    <DialogDescription>
                      Share this link with the person you want to invite. It expires in 7 days.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="relative flex items-center gap-4">
                    <Input value={inviteLink || ""} readOnly className="font-mono text-sm pr-11" />
                    <Button variant="ghost" className="size-9 rounded-lg absolute top-1 bottom-0 right-1" size="icon" onClick={copyInviteLink}>
                      {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <div className="h-9 w-6 bg-gradient-to-r from-transparent to-card absolute top-1 bottom-0 right-10" />
                  </div>

                  <DialogFooter>
                    <Button
                      onClick={() => {
                        setInviteLinkDialogOpen(false);
                        setInviteLink(null);
                        setCopiedLink(false);
                      }}
                    >
                      Done
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
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
            ) : deduplicatedInvites.length === 0 ? (
              <p className="text-base text-muted-foreground text-center pb-4 mt-4">
                No pending invites
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-normal text-muted-foreground w-[35%]">Invite</th>
                      <th className="pb-2 font-normal text-muted-foreground w-[15%]">Role</th>
                      <th className="pb-2 font-normal text-muted-foreground w-[20%]">Invited by</th>
                      <th className="pb-2 font-normal text-muted-foreground w-[20%]">Expires</th>
                      <th className="pb-2 w-[10%]" />
                    </tr>
                  </thead>
                  <tbody>
                    {deduplicatedInvites.map((invite) => (
                      <tr key={invite.id} className="border-b last:border-0">
                        <td className="h-14 text-sm">
                          {invite.email || <span className="text-muted-foreground">Link invite</span>}
                        </td>
                        <td className="h-14 text-sm">
                          <p className="text-foreground">
                            {formatRoleName(invite.role)}
                          </p>
                        </td>
                        <td className="h-14 text-sm text-foreground">{invite.invitedBy}</td>
                        <td className="h-14 text-sm text-foreground">
                          {new Date(invite.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="h-14 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-md"
                            onClick={() => handleRevokeInvite(invite.id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
