import { Button } from "components/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "components/components/ui/dialog";
import { Input } from "components/components/ui/input";
import { Label } from "components/components/ui/label";
import { LoadingButton } from "components/components/ui/loading-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/components/ui/select";
import type { OrganizationRole } from "shared/auth";
import { useState } from "react";

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateInvite: (email: string | undefined, role: OrganizationRole) => Promise<void>;
  isCreating: boolean;
}

/**
 * Dialog for inviting new team members
 */
export function InviteDialog({
  open,
  onOpenChange,
  onCreateInvite,
  isCreating,
}: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("MEMBER");

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setEmail("");
    }
  };

  const handleCreateWithEmail = async () => {
    await onCreateInvite(email, role);
    setEmail("");
  };

  const handleCreateLink = async () => {
    await onCreateInvite(undefined, role);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as OrganizationRole)}>
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
            <LoadingButton
              variant="outline"
              onClick={handleCreateLink}
              isLoading={isCreating}
              loadingText="Creating..."
            >
              Create link
            </LoadingButton>
            <LoadingButton onClick={handleCreateWithEmail} disabled={!email} isLoading={isCreating}>
              Send invite
            </LoadingButton>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
