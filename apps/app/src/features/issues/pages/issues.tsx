import { TopBarSearch } from "components/components/console";
import { ConsoleTopBarSearch } from "@/components/layout/console";
import { Badge } from "components/components/ui/badge";
import type { DataTableColumn } from "components/components/ui/data-table";
import { useDebounce } from "components/hooks";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { formatDate, PaginatedTable, repoName, TableEmpty } from "@/components/paginated-table";
import { type ReviewIssue, useReviewIssues } from "../hooks/use-review-issues";

function formatFixStatus(status: ReviewIssue["fixStatus"]) {
  if (!status) return "No fix";
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}

/** The last part of a path: the file and the folder it's in, such as "/utils/git.ts" */
function shortPath(path: string) {
  return `/${path.split("/").filter(Boolean).slice(-2).join("/")}`;
}

const COLUMNS: DataTableColumn<ReviewIssue>[] = [
  {
    key: "title",
    header: "Issue",
    cell: (row) => <span className="block max-w-96 truncate">{row.title || "Untitled issue"}</span>,
  },
  {
    key: "file",
    header: "File",
    cell: (row) =>
      row.path ? (
        // The file and its folder, such as "/utils/git.ts:341"; hover for the full path
        <Badge variant="secondary" title={row.path} className="max-w-64">
          <span className="truncate">
            {shortPath(row.path)}
            {row.line ? `:${row.line}` : ""}
          </span>
        </Badge>
      ) : (
        "—"
      ),
  },
  { key: "repo", header: "Repository", cell: (row) => repoName(row.owner, row.repo) },
  { key: "number", header: "Pull request", cell: (row) => `#${row.pullNumber}`, align: "end" },
  { key: "fix", header: "Fix", cell: (row) => formatFixStatus(row.fixStatus) },
  { key: "found", header: "Found", cell: (row) => formatDate(row.createdAt) },
];

/** Every issue reviews have flagged, newest first; a row opens its pull request */
export function IssuesPage() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search.trim(), 300);
  const { data, isLoading, error } = useReviewIssues(
    user?.access_token,
    currentOrgId,
    page,
    debouncedSearch
  );

  // A new search starts from the first page
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets whenever the search changes
  useEffect(() => setPage(1), [debouncedSearch]);

  return (
    <div className="flex flex-1 flex-col">
      <ConsoleTopBarSearch>
        <TopBarSearch
          shortcut="f"
          placeholder="Search issues"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </ConsoleTopBarSearch>
      <PaginatedTable
        label="Issues"
        storageKey="issues"
        fullWidth
        rows={data?.issues}
        columns={COLUMNS}
        getKey={(row) => row.id}
        pagination={data?.pagination}
        isLoading={isLoading}
        error={error}
        empty={
          debouncedSearch ? (
            <TableEmpty
              title="No matching issues"
              description={`Nothing matches "${debouncedSearch}". Try a file path or repository name.`}
            />
          ) : (
            <TableEmpty
              title="No issues yet"
              description="Issues Contrast flags in your pull requests will show up here."
            />
          )
        }
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/console/pull-requests/${row.reviewId}`)}
      />
    </div>
  );
}
