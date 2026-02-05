import { Loader2 } from "lucide-react";
import { Badge } from "opendiff-components/components/ui/badge";
import { Button } from "opendiff-components/components/ui/button";
import type { PullRequestFixDetail } from "../hooks/use-pull-requests";
import { DiffBlock } from "./diff-block";
import MarkdownBlock from "./markdown-block";

/** Displays a colored badge indicating the fix status (Accepted, Rejected, or Pending). */
export function FixStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ACCEPTED":
      return (
        <Badge variant="default" className="font-normal">
          Accepted
        </Badge>
      );
    case "REJECTED":
      return (
        <Badge variant="secondary" className="font-normal text-muted-foreground">
          Rejected
        </Badge>
      );
    case "PENDING":
      return (
        <Badge variant="outline" className="font-normal">
          Pending
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="font-normal">
          {status}
        </Badge>
      );
  }
}

/** Renders a suggested fix with its diff, summary, status badge, and accept/reject actions. */
export function FixCard({
  fix,
  reviewId,
  onAccept,
  onReject,
  isAccepting,
  isRejecting,
}: {
  fix: PullRequestFixDetail;
  reviewId: string;
  onAccept: (reviewId: string, fixId: string) => void;
  onReject: (reviewId: string, fixId: string) => void;
  isAccepting: boolean;
  isRejecting: boolean;
}) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          Suggested Fix
        </span>
        <FixStatusBadge status={fix.status} />
      </div>

      {fix.summary && (
        <div className="text-sm text-muted-foreground">
          <MarkdownBlock content={fix.summary} />
        </div>
      )}

      {fix.diff && <DiffBlock diff={fix.diff} />}

      {fix.status === "ACCEPTED" && fix.commitSha && (
        <p className="text-xs text-muted-foreground">
          Commit: <code className="bg-muted px-1 rounded">{fix.commitSha.slice(0, 7)}</code>
        </p>
      )}

      {fix.status === "PENDING" && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => onAccept(reviewId, fix.id)}
            disabled={isAccepting || isRejecting}
          >
            {isAccepting && <Loader2 className="size-3.5 animate-spin" />}
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReject(reviewId, fix.id)}
            disabled={isAccepting || isRejecting}
          >
            {isRejecting && <Loader2 className="size-3.5 animate-spin" />}
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
