import { Button } from "components/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/components/ui/dialog";
import { Input } from "components/components/ui/input";
import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

interface InviteLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteLink: string | null;
}

/**
 * Dialog showing the generated invite link
 */
export function InviteLinkDialog({ open, onOpenChange, inviteLink }: InviteLinkDialogProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite link created</DialogTitle>
          <DialogDescription>
            Share this link with the person you want to invite. It expires in 7 days.
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex items-center gap-4">
          <Input value={inviteLink || ""} readOnly className="text-sm pr-11 bg-background" />
          <Button
            variant="ghost"
            className="size-9 rounded-lg absolute top-1 bottom-0 right-1"
            size="icon"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <div className="h-9 w-6 bg-gradient-to-r from-transparent to-background absolute top-1 bottom-0 right-10" />
        </div>

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
