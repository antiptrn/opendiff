import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FilterPopover,
  ListHeader,
  ListTab,
  PullRequestRow,
  SortMenu,
  TopBarSearch,
} from "components/components/console";
import { Avatar, AvatarFallback } from "components/components/ui/avatar";
import { Button } from "components/components/ui/button";
import { Checkbox } from "components/components/ui/checkbox";
import { DataTablePagination } from "components/components/ui/data-table";
import { useDebounce } from "components/hooks";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { ConsoleTopBarSearch } from "@/components/layout/console";
import { TableEmpty } from "@/components/paginated-table";
import {
  type PullRequestSort,
  type PullRequestStateFilter,
  usePullRequests,
} from "../hooks/use-pull-requests";

const SORT_OPTIONS: { value: PullRequestSort; label: string }[] = [
  { value: "reviewed", label: "Recently reviewed" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "issues", label: "Most issues found" },
  { value: "comments", label: "Most commented" },
];

export function PullRequestsListPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<PullRequestStateFilter>("open");
  const [authors, setAuthors] = useState<string[]>([]);
  // Links such as a repository's "pull requests" arrive with ?repo=owner/name
  const [repos, setRepos] = useState<string[]>(() => {
    const repo = searchParams.get("repo");
    return repo ? [repo] : [];
  });
  const [sort, setSort] = useState<PullRequestSort>("reviewed");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const q = useDebounce(search, 300);

  const { data, isLoading, error } = usePullRequests(user?.access_token, currentOrgId, {
    page,
    state,
    authors,
    repos,
    q,
    sort,
  });

  // Any change to what's listed goes back to the first page and clears the selection
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets whenever a filter changes
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [state, authors, repos, q, sort]);

  const rows = data?.reviews ?? [];
  const selectedOnPage = rows.filter((row) => selected.has(row.id)).length;
  const allSelected = rows.length > 0 && selectedOnPage === rows.length;
  const isFiltered = authors.length > 0 || repos.length > 0 || !!q;
  const hasAnyPullRequests = !!data && data.counts.open + data.counts.closed > 0;

  const toggleRow = (id: string, isSelected: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });

  const searchSlot = (
    <ConsoleTopBarSearch>
      <TopBarSearch
        shortcut="f"
        placeholder="Search pull requests"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </ConsoleTopBarSearch>
  );

  if (isLoading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status">
        {searchSlot}
        <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading pull requests…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col p-4">
        {searchSlot}
        <p className="py-12 text-center text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  // Nothing reviewed yet at all: the page-wide empty state rather than an empty list
  if (!hasAnyPullRequests && !isFiltered) {
    return (
      <div className="flex w-full flex-1 flex-col p-4">
        {searchSlot}
        <TableEmpty
          title="No pull requests yet"
          description="Pull requests show up here once Contrast reviews them."
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col p-4">
      {searchSlot}

      <div className="overflow-hidden rounded-lg border border-border-solid">
        {/* Header: select all, Open/Closed, then the filter and sort menus */}
        <ListHeader>
          <Checkbox
            aria-label="Select all pull requests on this page"
            className="mr-1"
            disabled={rows.length === 0}
            checked={allSelected ? true : selectedOnPage > 0 ? "indeterminate" : false}
            onCheckedChange={() =>
              setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))
            }
          />
          {selectedOnPage > 0 ? (
            <div className="flex items-center gap-2 text-sm">
              <span>{selectedOnPage} selected</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          ) : (
            <div className="flex items-center">
              <ListTab
                label="Open"
                count={data?.counts.open}
                active={state === "open"}
                onClick={() => setState("open")}
              />
              <ListTab
                label="Closed"
                count={data?.counts.closed}
                active={state === "closed"}
                onClick={() => setState("closed")}
              />
            </div>
          )}

          <div className="ml-auto flex flex-wrap items-center">
            <FilterPopover
              label="Author"
              title="Filter by author"
              options={data?.facets.authors ?? []}
              selected={authors}
              onChange={setAuthors}
              renderIcon={(author) => (
                <Avatar className="size-4">
                  <AvatarFallback className="text-[9px]">
                    {author.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
            />
            <FilterPopover
              label="Repository"
              title="Filter by repository"
              options={data?.facets.repos ?? []}
              selected={repos}
              onChange={setRepos}
            />
            <SortMenu value={sort} options={SORT_OPTIONS} onChange={setSort} />
          </div>
        </ListHeader>

        {rows.length === 0 ? (
          <TableEmpty
            variant="plain"
            title={state === "closed" ? "No closed pull requests" : "No open pull requests"}
            description={
              isFiltered ? "Nothing matches these filters." : "Reviewed pull requests show up here."
            }
          />
        ) : (
          <ul aria-label="Pull requests">
            {rows.map((row) => (
              <PullRequestRow
                key={row.id}
                pullRequest={row}
                selected={selected.has(row.id)}
                onSelectedChange={(isSelected) => toggleRow(row.id, isSelected)}
                onOpen={() => navigate(`/console/pull-requests/${row.id}`)}
              />
            ))}
          </ul>
        )}

        {data && data.pagination.totalPages > 1 && (
          <div className="border-t border-border-solid">
            <DataTablePagination
              label="Pull request pages"
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
