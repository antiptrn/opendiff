import { Button } from "components/components/ui/button";
import { Skeleton } from "components/components/ui/skeleton";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ExternalLink, GitPullRequest } from "lucide-react";
import { useState } from "react";
import type { PullRequestSummary } from "../hooks/use-pull-requests";

function PullRequestRow({ pullRequest }: { pullRequest: PullRequestSummary; showRepo?: boolean }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className="w-full text-left py-4 select-none transition-opacity duration-150 group-hover/pr-list:opacity-40 hover:!opacity-100"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-3">
        <GitPullRequest className="size-5 text-foreground" />
        <div className="min-w-0 flex flex-col">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-lg truncate">
              {`#${pullRequest.pullNumber} ${pullRequest.pullTitle}` ||
                `PR #${pullRequest.pullNumber}`}
            </span>
            {pullRequest.pullUrl && (
              <motion.div
                initial={false}
                animate={{
                  x: hovered ? 0 : -8,
                  opacity: hovered ? 1 : 0,
                }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2"
                style={{ pointerEvents: hovered ? "auto" : "none" }}
              >
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pullRequest.pullUrl)
                      window.open(pullRequest.pullUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  <ExternalLink className="size-4" />
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/** Skeleton placeholder displayed while the pull requests list is loading. */
export function PullRequestsListSkeleton() {
  return (
    <div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="py-4">
          <Skeleton className="h-7 w-64 rounded-md" />
        </div>
      ))}
    </div>
  );
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PullRequestsListProps {
  pullRequests: PullRequestSummary[];
  pagination?: Pagination;
  page: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  emptyMessage?: string;
  showRepo?: boolean;
}

/** Renders a paginated list of pull requests with navigation controls and empty state handling. */
export function PullRequestsList({
  pullRequests,
  pagination,
  page,
  onPageChange,
  isLoading,
  emptyMessage = "No pull requests yet. Reviews will appear here after a PR is reviewed.",
  showRepo = true,
}: PullRequestsListProps) {
  const showSkeleton = isLoading && pullRequests.length === 0;

  return (
    <>
      {showSkeleton && <PullRequestsListSkeleton />}

      {!showSkeleton && pullRequests.length === 0 && (
        <p className="text-base text-foreground py-7 text-start">{emptyMessage}</p>
      )}

      {!showSkeleton && pullRequests.length > 0 && (
        <div className="my-6 group/pr-list">
          {pullRequests.map((pullRequest) => (
            <PullRequestRow key={pullRequest.id} pullRequest={pullRequest} showRepo={showRepo} />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}{" "}
            pull requests
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(pagination.totalPages, page + 1))}
              disabled={page === pagination.totalPages}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
