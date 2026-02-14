import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "components/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "components/components/ui/avatar";
import { Badge } from "components/components/ui/badge";
import { Button } from "components/components/ui/button";
import { Card, CardContent } from "components/components/ui/card";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";

import { Separator } from "components/components/ui/separator";
import { Skeleton } from "components/components/ui/skeleton";
import {
  CheckCheck,
  CircleDot,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { FileGroupCard } from "../components/file-group-card";
import MarkdownBlock from "../components/markdown-block";
import { PullRequestDetailSkeleton } from "../components/pull-request-detail-skeleton";
import {
  type PullRequestCommentDetail,
  useAcceptFix,
  usePullRequestDetail,
  useRejectFix,
} from "../hooks/use-pull-requests";

export function PullRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();

  const { data, isLoading } = usePullRequestDetail(user?.access_token, currentOrgId, id);

  const acceptFix = useAcceptFix(user?.access_token, currentOrgId);
  const rejectFix = useRejectFix(user?.access_token, currentOrgId);

  const handleAccept = async (reviewId: string, fixId: string) => {
    try {
      await acceptFix.mutateAsync({ reviewId, fixId });
      toast.success("Fix accepted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept fix");
    }
  };

  const handleReject = async (reviewId: string, fixId: string) => {
    try {
      await rejectFix.mutateAsync({ reviewId, fixId });
      toast.success("Fix rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject fix");
    }
  };

  const [isAcceptingAll, setIsAcceptingAll] = useState(false);

  const handleAcceptAll = async () => {
    if (!review) return;
    const pendingComments = review.comments.filter((c) => c.fix?.status === "PENDING");
    if (pendingComments.length === 0) return;

    setIsAcceptingAll(true);
    try {
      for (const comment of pendingComments) {
        if (!comment.fix) continue;
        await acceptFix.mutateAsync({ reviewId: review.id, fixId: comment.fix.id });
      }
      toast.success(`${pendingComments.length} fixes accepted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept all fixes");
    } finally {
      setIsAcceptingAll(false);
    }
  };

  const review = data?.review;

  // Group comments by file path
  const fileGroups = (() => {
    if (!review) return [];
    const grouped = new Map<string, PullRequestCommentDetail[]>();
    for (const comment of review.comments) {
      const key = comment.path || "(general)";
      const list = grouped.get(key);
      if (list) {
        list.push(comment);
      } else {
        grouped.set(key, [comment]);
      }
    }
    return Array.from(grouped.entries()).map(([path, comments]) => ({
      path,
      comments,
    }));
  })();

  const totalComments = review?.comments.length ?? 0;
  const pendingFixes = review?.comments.filter((c) => c.fix?.status === "PENDING").length ?? 0;
  const fileCount = fileGroups.length;

  // Count total diff additions/deletions across all fix diffs
  const diffStats = (() => {
    let additions = 0;
    let deletions = 0;
    for (const comment of review?.comments ?? []) {
      if (!comment.fix?.diff) continue;
      for (const line of comment.fix.diff.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }
    }
    return { additions, deletions };
  })();

  const acceptingFixId = acceptFix.isPending ? (acceptFix.variables?.fixId ?? null) : null;
  const rejectingFixId = rejectFix.isPending ? (rejectFix.variables?.fixId ?? null) : null;

  return (
    <div className="">
      <div className="p-0">
        {/* Back link */}
        <Link
          to="/console/pull-requests"
          className="m-8 mb-0 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Pull Requests
        </Link>

        {isLoading ? (
          <PullRequestDetailSkeleton />
        ) : !review ? (
          <p className="m-8 text-muted-foreground py-10 text-center">Review not found</p>
        ) : (
          <>
            {/* Header */}
            <div className="m-8 flex flex-col gap-3">
              {/* Status badge */}
              <div className="mb-3">
                {review.pullStatus === "merged" ? (
                  <Badge className="gap-1 bg-purple-600/10 text-purple-600 dark:bg-purple-400/10 dark:text-purple-400">
                    <GitMerge className="size-3" />
                    Merged
                  </Badge>
                ) : review.pullStatus === "closed" ? (
                  <Badge className="gap-1 bg-red-600/10 text-red-600 dark:bg-red-400/10 dark:text-red-400">
                    <CircleDot className="size-3" />
                    Closed
                  </Badge>
                ) : (
                  <Badge className="gap-1 bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400">
                    <GitPullRequest className="size-3" />
                    Open
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-1">
                {/* Repo + PR number */}
                <p className="text-sm text-muted-foreground mb-1">
                  {review.owner}/{review.repo} #{review.pullNumber}
                </p>

                {/* PR title */}
                <h1 className="text-2xl mb-3">{review.pullTitle || `PR #${review.pullNumber}`}</h1>
              </div>
              <Separator />
              {/* Author line */}
              <div className="flex items-center gap-3 my-2 text-sm text-muted-foreground">
                {review.pullAuthor && (
                  <div className="flex items-center gap-2">
                    <Avatar className="size-4">
                      <AvatarImage
                        src={`https://github.com/${review.pullAuthor}.png?size=40`}
                        alt={review.pullAuthor}
                      />
                      <AvatarFallback>{review.pullAuthor.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span>{review.pullAuthor}</span>
                  </div>
                )}
                {review.headBranch && review.baseBranch && (
                  <span className="font-mono text-xs">
                    {review.headBranch}
                    <span className="mx-1 text-muted-foreground/60">&rarr;</span>
                    {review.baseBranch}
                  </span>
                )}
                {fileCount > 0 && (
                  <span>
                    {fileCount} file{fileCount !== 1 ? "s" : ""}
                  </span>
                )}
                {(diffStats.additions > 0 || diffStats.deletions > 0) && (
                  <span className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400">
                      +{diffStats.additions}
                    </span>
                    <span className="text-red-600 dark:text-red-400">-{diffStats.deletions}</span>
                  </span>
                )}
                {review.pullUrl && (
                  <a
                    href={review.pullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground ml-auto"
                  >
                    <ExternalLink className="size-3.5" />
                    View on GitHub
                  </a>
                )}
              </div>
              <Separator />
            </div>

            {/* Two-column layout */}
            <div className="flex gap-8 m-8">
              {/* Main content */}
              <div className="flex-1 min-w-0 space-y-8">
                {/* AI Summary */}
                {review.summaryStatus === 1 && !review.summary && (
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Loader2 className="size-4 animate-spin" />
                        Generating AI summary...
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-4/6" />
                      </div>
                    </CardContent>
                  </Card>
                )}
                {review.summary && (
                  <Accordion defaultValue={[0]}>
                    <AccordionItem value={0}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-1.5">
                          <div className="relative">
                            <Sparkles className="size-3" />
                          </div>
                          <h3 className="text-sm">AI Analysis</h3>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <MarkdownBlock content={review.summary} />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
                {review.pullBody && <MarkdownBlock content={review.pullBody} />}
              </div>
            </div>
            <Separator />
            <div className="px-8">
              {/* Comments summary */}
              {totalComments > 0 && (
                <div className="flex items-center justify-between my-8">
                  <p className="text-base text-muted-foreground">
                    <span className="text-foreground">
                      {totalComments} comment
                      {totalComments !== 1 ? "s" : ""}
                    </span>
                    {pendingFixes > 0 && (
                      <>
                        ,{" "}
                        <span className="text-foreground">
                          {pendingFixes} pending fix
                          {pendingFixes !== 1 ? "es" : ""}
                        </span>
                      </>
                    )}{" "}
                    across{" "}
                    <span className="text-foreground">
                      {fileCount} file{fileCount !== 1 ? "s" : ""}
                    </span>
                  </p>
                  {pendingFixes > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAcceptAll}
                      disabled={isAcceptingAll}
                    >
                      {isAcceptingAll ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCheck className="size-4" />
                      )}
                      Accept All Fixes
                    </Button>
                  )}
                </div>
              )}

              {/* File-grouped comments */}
              {totalComments === 0 ? (
                <p className="text-muted-foreground py-6 text-center">No comments yet</p>
              ) : (
                <div className="space-y-8 mb-8">
                  {fileGroups.map(({ path, comments }, index) => (
                    <FileGroupCard
                      index={index}
                      key={path}
                      filePath={path}
                      fileTitle={review.fileTitles?.[path] ?? null}
                      fileTitleLoading={review.fileTitlesStatus === 1 && !review.fileTitles}
                      comments={comments}
                      reviewId={review.id}
                      onAcceptFix={handleAccept}
                      onRejectFix={handleReject}
                      acceptingFixId={acceptingFixId}
                      rejectingFixId={rejectingFixId}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
