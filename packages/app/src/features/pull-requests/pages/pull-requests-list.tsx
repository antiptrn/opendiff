import { Search } from "lucide-react";
import { Input } from "components/components/ui/input";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PullRequestsList } from "../components/pull-requests-list";
import { usePullRequests } from "../hooks/use-pull-requests";

export function PullRequestsListPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get("repo") || "");

  // If input looks like a repo filter (contains "/"), use it as server-side repo filter
  const repoFilter = search.includes("/") ? search : undefined;

  const { data, isLoading } = usePullRequests(user?.access_token, currentOrgId, page, repoFilter);

  const filteredPullRequests = useMemo(() => {
    const pullRequests = data?.reviews || [];
    if (!search || repoFilter) return pullRequests;
    const q = search.toLowerCase();
    return pullRequests.filter(
      (r) =>
        r.pullTitle?.toLowerCase().includes(q) ||
        String(r.pullNumber).includes(search) ||
        r.pullAuthor?.toLowerCase().includes(q) ||
        r.repo?.toLowerCase().includes(q) ||
        r.owner?.toLowerCase().includes(q)
    );
  }, [data?.reviews, search, repoFilter]);

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Pull Requests</h1>

      <div className="flex gap-2 mb-4">
        <div className="relative min-w-120">
          <Search
            strokeWidth={2.5}
            className="size-4.5 absolute left-5 top-1/2 -translate-y-1/2 text-foreground"
          />
          <Input
            className="pl-12.5 shadow-md dark:shadow-none"
            placeholder="Search pull requests..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <PullRequestsList
        pullRequests={filteredPullRequests}
        pagination={search && !repoFilter ? undefined : data?.pagination}
        page={page}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage={
          search
            ? `No pull requests matching "${search}"`
            : "No pull requests yet. Reviews will appear here after a PR is reviewed."
        }
      />
    </div>
  );
}
