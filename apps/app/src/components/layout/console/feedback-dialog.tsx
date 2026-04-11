import { Button } from "components/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/components/ui/dialog";
import { Textarea } from "components/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { API_URL } from "shared/services";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken?: string;
}

export function FeedbackDialog({ open, onOpenChange, accessToken }: FeedbackDialogProps) {
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!message.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          message,
          page: location.pathname,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit feedback");
      }

      setSuccess(true);
      setMessage("");

      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setIsSubmitting(false);
    }
  }, [message, accessToken, location.pathname, onOpenChange]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      onOpenChange(open);
      // Reset state when dialog closes
      if (!open) {
        // Small delay to let close animation finish before resetting
        setTimeout(() => {
          setSuccess(false);
          setError(null);
        }, 200);
      }
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Share your thoughts, report bugs, or suggest improvements.
          </DialogDescription>
        </DialogHeader>
        {success ? (
          <div className="py-6 text-center">
            <p className="text-foreground">Thanks for your feedback!</p>
          </div>
        ) : (
          <>
            <Textarea
              placeholder="What's on your mind?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-32 bg-background"
              disabled={isSubmitting}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting || !message.trim()}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Feedback"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
