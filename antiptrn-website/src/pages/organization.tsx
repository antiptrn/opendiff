import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useOrganization,
  useOrganizationMembers,
  useOrganizationInvites,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/hooks/use-organization";
import { useAuth, type OrganizationRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  UserPlus,
  Copy,
  Check,
  Trash2,
  MoreHorizontal,
  Mail,
  Link as LinkIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const roleBadgeVariant: Record<OrganizationRole, "default" | "secondary" | "outline"> = {
  OWNER: "default",
  ADMIN: "secondary",
  MEMBER: "outline",
};

type TabType = "members" | "invites";

export default function OrganizationPage() {
  const { user } = useAuth();
  const { currentOrgId, orgDetails, canManageMembers } = useOrganization();
  const { data: members, isLoading: isLoadingMembers } = useOrganizationMembers(currentOrgId);
  const {
    invites,
    isLoading: isLoadingInvites,
    createInvite,
    isCreatingInvite,
    revokeInvite,
  } = useOrganizationInvites(currentOrgId);
  const updateRoleMutation = useUpdateMemberRole(currentOrgId);
  const removeMemberMutation = useRemoveMember(currentOrgId);

  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs: TabType[] = ["members", "invites"];
  const tabParam = searchParams.get("tab") as TabType | null;
  const activeTab: TabType = tabParam && validTabs.includes(tabParam) ? tabParam : "members";

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("MEMBER");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

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

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Organization</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          {canManageMembers && <TabsTrigger value="invites">Invites</TabsTrigger>}
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  {isLoadingMembers ? (
                    <Skeleton className="h-4 w-32" />
                  ) : (
                    <>{members?.length || 0} of {orgDetails?.seatCount || 0} seats used</>
                  )}
                </CardDescription>
              </div>
              {canManageMembers && (
                <Dialog open={inviteDialogOpen} onOpenChange={(open) => {
                  setInviteDialogOpen(open);
                  if (!open) {
                    setInviteEmail("");
                    setInviteLink(null);
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Invite member
                    </Button>
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
                          <Button variant="outline" onClick={() => {
                            setInviteLink(null);
                            setInviteDialogOpen(false);
                          }}>
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
                            variant="outline"
                            onClick={() => handleCreateInvite(false)}
                            disabled={isCreatingInvite}
                          >
                            <LinkIcon className="mr-2 h-4 w-4" />
                            Create link
                          </Button>
                          <Button
                            onClick={() => handleCreateInvite(true)}
                            disabled={isCreatingInvite || !inviteEmail}
                          >
                            {isCreatingInvite ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Mail className="mr-2 h-4 w-4" />
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
                      <TableHead>Joined</TableHead>
                      {canManageMembers && <TableHead className="w-[50px]" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members?.map((member) => (
                      <TableRow key={member.userId}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <img
                              src={member.avatarUrl || undefined}
                              alt={member.login}
                              className="w-8 h-8 rounded-full"
                            />
                            <div>
                              <p className="font-medium">{member.name || member.login}</p>
                              <p className="text-sm text-muted-foreground">@{member.login}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleBadgeVariant[member.role]}>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </TableCell>
                        {canManageMembers && (
                          <TableCell>
                            {member.userId !== user?.visitorId && member.role !== "OWNER" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleRoleChange(member.userId, member.role === "ADMIN" ? "MEMBER" : "ADMIN")}
                                  >
                                    Make {member.role === "ADMIN" ? "Member" : "Admin"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleRemoveMember(member.userId)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invites" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Invites</CardTitle>
              <CardDescription>
                Invites that haven't been accepted yet
              </CardDescription>
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
                <p className="text-center text-muted-foreground py-8">
                  No pending invites
                </p>
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
                          {invite.email || (
                            <span className="text-muted-foreground">Link invite</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleBadgeVariant[invite.role]}>
                            {invite.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {invite.invitedBy}
                        </TableCell>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
