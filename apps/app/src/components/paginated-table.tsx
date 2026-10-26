import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataTable, type DataTableColumn, DataTablePagination } from "components/components/ui/data-table";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "components/components/ui/empty";
import { cn } from "components/utils";
import type { ReactNode } from "react";

/** Page position returned by the paginated list endpoints */
export interface TablePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Short date for table cells, e.g. "Oct 21, 2026" */
export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "owner/repo", or a dash when the repository is unknown */
export function repoName(owner: string | null, repo: string | null) {
  return owner && repo ? `${owner}/${repo}` : "—";
}

/**
 * A table in a bordered box inset from the page edges, with a centred spinner while loading,
 * error and empty states, and pagination at the bottom
 */
/** Empty state for a table or list: the empty-list illustration, a title, a line of description and an optional action, such as a button to add the first item */
export function TableEmpty({
  title,
  description,
  action,
  variant = "default",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** "plain" drops the border, for places that already have one such as a popover */
  variant?: "default" | "plain";
}) {
  return (
    <Empty variant={variant} className="p-12">
      <EmptyHeader>
        <EmptyMedia variant="icon" />
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent className="mt-3">{action}</EmptyContent>}
    </Empty>
  );
}

export function PaginatedTable<T>({
  label,
  rows,
  columns,
  getKey,
  pagination,
  isLoading,
  error,
  empty,
  onPageChange,
  onRowClick,
  storageKey,
  fullWidth = false,
}: {
  label: string;
  /** Stretch the table across the page instead of fitting its columns */
  fullWidth?: boolean;
  /** Where the table remembers dragged column widths; defaults to the label */
  storageKey?: string;
  rows?: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getKey: (row: T) => string;
  /** Omit to hide the page buttons, such as while results are filtered on the client */
  pagination?: TablePagination;
  isLoading: boolean;
  error?: Error | null;
  /** Shown when there are no rows, usually a TableEmpty */
  empty: ReactNode;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
}) {
  let body: ReactNode;
  if (isLoading && !rows) {
    body = (
      <div className="flex flex-1 items-center justify-center py-12" role="status">
        <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading {label.toLowerCase()}…</span>
      </div>
    );
  } else if (error) {
    body = <p className="px-5 py-12 text-center text-muted-foreground">{error.message}</p>;
  } else if (!rows || rows.length === 0) {
    body = empty;
  } else {
    body = (
      <DataTable
        label={label}
        rows={rows}
        columns={columns}
        getKey={getKey}
        onRowClick={onRowClick}
        storageKey={storageKey}
        fullWidth={fullWidth}
      />
    );
  }

  const showsTable = !!rows && rows.length > 0 && !error;

  return (
    <div className={cn("flex w-full flex-1 flex-col p-4", !fullWidth && "max-w-6xl")}>
      {showsTable ? (
        // The table and its page buttons sit in a bordered box inset from the page edges, as wide as
        // the table's columns
        <div
          className={cn(
            "max-w-full overflow-hidden rounded-lg border border-border-solid",
            !fullWidth && "w-fit"
          )}
        >
          {body}
          {pagination && pagination.total > 0 && onPageChange && (
            <div className="border-t border-border-solid">
              <DataTablePagination
                label={`${label} pages`}
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                onPageChange={onPageChange}
              />
            </div>
          )}
        </div>
      ) : (
        body
      )}
    </div>
  );
}
