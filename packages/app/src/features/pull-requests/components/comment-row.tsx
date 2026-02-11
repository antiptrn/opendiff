import type { PullRequestCommentDetail } from "../hooks/use-pull-requests";
import { FixCard } from "./fix-card";

/** Displays a single review comment with its line number, body text, and optional fix card. */
export function CommentRow({
  comment,
  reviewId,
  onAcceptFix,
  onRejectFix,
  acceptingFixId,
  rejectingFixId,
}: {
  comment: PullRequestCommentDetail;
  reviewId: string;
  onAcceptFix: (reviewId: string, fixId: string) => void;
  onRejectFix: (reviewId: string, fixId: string) => void;
  acceptingFixId: string | null;
  rejectingFixId: string | null;
}) {
  return (
    <div className="px-4 py-3">
      <div className="space-y-1">
        {comment.line != null && (
          <span className="inline-block text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            L{comment.line}
          </span>
        )}
        <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
      </div>

      {comment.fix && (
        <FixCard
          fix={comment.fix}
          reviewId={reviewId}
          onAccept={onAcceptFix}
          onReject={onRejectFix}
          isAccepting={acceptingFixId === comment.fix.id}
          isRejecting={rejectingFixId === comment.fix.id}
        />
      )}
    </div>
  );
}
