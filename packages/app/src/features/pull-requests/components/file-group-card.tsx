import { FileCode, MessageSquare } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "components/components/ui/accordion";
import NumberBadge from "components/components/ui/number-badge";
import { Skeleton } from "components/components/ui/skeleton";
import {
  TooltipContent,
  TooltipRoot,
  TooltipTrigger,
} from "components/components/ui/tooltip";
import type { PullRequestCommentDetail } from "../hooks/use-pull-requests";
import { CommentRow } from "./comment-row";

/** Collapsible card grouping review comments by file path, showing comment count and pending fixes. */
export function FileGroupCard({
  index,
  filePath,
  fileTitle,
  fileTitleLoading,
  comments,
  reviewId,
  onAcceptFix,
  onRejectFix,
  acceptingFixId,
  rejectingFixId,
}: {
  index: number;
  filePath: string;
  fileTitle: string | null;
  fileTitleLoading: boolean;
  comments: PullRequestCommentDetail[];
  reviewId: string;
  onAcceptFix: (reviewId: string, fixId: string) => void;
  onRejectFix: (reviewId: string, fixId: string) => void;
  acceptingFixId: string | null;
  rejectingFixId: string | null;
}) {
  const pendingCount = comments.filter((c) => c.fix?.status === "PENDING").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <NumberBadge number={index + 1} />
        {fileTitleLoading ? (
          <Skeleton className="h-7 w-40 rounded-md" />
        ) : fileTitle ? (
          <h3 className="text-lg text-foreground truncate">{fileTitle}</h3>
        ) : null}
      </div>
      <Accordion defaultValue={[0]}>
        <AccordionItem value={0}>
          <AccordionTrigger>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-between">
              <div className="flex items-center gap-1.5">
                <FileCode className="size-3 text-foreground shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm truncate">{filePath}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mr-2">
                <TooltipRoot>
                  <TooltipTrigger delay={125}>
                    <div className="flex items-center gap-1 select-none cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                      <MessageSquare className="size-3 shrink-0" />
                      <span className="text-xs font-normal">{comments.length}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={8}>
                    {comments.length} comment{comments.length !== 1 ? "s" : ""}
                  </TooltipContent>
                </TooltipRoot>
                {pendingCount > 0 && (
                  <p className="text-xs text-muted-foreground">{pendingCount} pending</p>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <div className="divide-y">
              {comments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  reviewId={reviewId}
                  onAcceptFix={onAcceptFix}
                  onRejectFix={onRejectFix}
                  acceptingFixId={acceptingFixId}
                  rejectingFixId={rejectingFixId}
                />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
