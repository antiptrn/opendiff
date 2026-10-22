import { TopBarSearch } from "components/components/console";
import { ConsoleTopBarSearch } from "@/components/layout/console";
import type { DataTableColumn } from "components/components/ui/data-table";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { formatDate, PaginatedTable, repoName, TableEmpty } from "@/components/paginated-table";
import { type PullRequestSummary, usePullRequests } from "../hooks/use-pull-requests";

const COLUMNS: DataTableColumn<PullRequestSummary>[] = [
  {
    key: "title",
    header: "Pull request",
    cell: (row) => (
      <span className="block max-w-96 truncate">{row.pullTitle || `#${row.pullNumber}`}</span>
    ),
  },
  { key: "repo", header: "Repository", cell: (row) => repoName(row.owner, row.repo) },
  { key: "number", header: "Number", cell: (row) => `#${row.pullNumber}`, align: "end" },
  { key: "author", header: "Author", cell: (row) => row.pullAuthor || "—" },
  { key: "issues", header: "Issues", cell: (row) => row.commentCount, align: "end" },
  { key: "fixes", header: "Fixes", cell: (row) => row.fixCount, align: "end" },
  { key: "reviewed", header: "Last reviewed", cell: (row) => formatDate(row.createdAt) },
];

export function PullRequestsListPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get("repo") || "");

  // If input looks like a repo filter (contains "/"), use it as server-side repo filter
  const repoFilter = search.includes("/") ? search : undefined;

  const { data, isLoading, error } = usePullRequests(
    user?.access_token,
    currentOrgId,
    page,
    repoFilter
  );

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
    <div className="flex flex-1 flex-col">
      <ConsoleTopBarSearch>
        <TopBarSearch
          shortcut="f"
          placeholder="Search pull requests"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </ConsoleTopBarSearch>

      <PaginatedTable
        label="Pull requests"
        rows={data ? filteredPullRequests : undefined}
        columns={COLUMNS}
        getKey={(row) => row.id}
        pagination={search && !repoFilter ? undefined : data?.pagination}
        isLoading={isLoading}
        error={error}
        empty={
          search ? (
            <TableEmpty
              title="No matching pull requests"
              description={`Nothing matches "${search}". Try a title, author or repository.`}
            />
          ) : (
            <TableEmpty
              title="No pull requests yet"
              description="Pull requests show up here once Contrast reviews them."
            />
          )
        }
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/console/pull-requests/${row.id}`)}
      />
    </div>
  );
}
