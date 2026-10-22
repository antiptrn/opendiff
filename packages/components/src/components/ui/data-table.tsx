import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Button } from "./button";
import { Skeleton } from "./skeleton";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Cell width, e.g. "w-56". The first column defaults to a wide name column. */
  className?: string;
  align?: "start" | "end";
}

const cellBase =
  "border-b border-r border-border-solid px-3 text-left align-middle whitespace-nowrap";

/**
 * Spreadsheet-like record table (after qargo's): hairline grid and a filler column to the right
 * edge. The last row has no bottom line, so the table sits flush in a bordered container. The
 * first cell of each row should hold the row's link or button. While `loading`, the header shows
 * with rows of skeleton cells in place of the data.
 */
export function DataTable<T>({
  label,
  rows,
  columns,
  getKey,
  onRowClick,
  loading = false,
  skeletonRows = 5,
}: {
  label: string;
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  /** How many skeleton rows to show while loading */
  skeletonRows?: number;
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table
        aria-label={label}
        aria-busy={loading || undefined}
        className="w-full border-separate border-spacing-0 text-sm"
      >
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  cellBase,
                  "h-11 font-medium text-foreground",
                  index === 0 && "w-72 min-w-56 pl-4",
                  column.align === "end" && "text-right",
                  column.className
                )}
              >
                {column.header}
              </th>
            ))}
            <th aria-hidden="true" className="w-full border-b border-border-solid" />
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: skeletonRows }, (_, rowIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows never reorder
              <tr key={rowIndex} className="group/row">
                {columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={cn(
                      cellBase,
                      "h-10 group-last/row:border-b-0",
                      index === 0 && "pl-4",
                      column.className
                    )}
                  >
                    <Skeleton
                      muted
                      className={cn(
                        "h-4 rounded-sm",
                        index === 0 ? "w-40 max-w-full" : "w-3/4 max-w-24",
                        column.align === "end" && "ml-auto"
                      )}
                    />
                  </td>
                ))}
                <td aria-hidden="true" className="border-b border-border-solid group-last/row:border-b-0" />
              </tr>
            ))}
          {!loading && rows.map((row) => (
            <tr
              key={getKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "group/row transition-colors hover:bg-muted/60",
                onRowClick && "cursor-pointer"
              )}
            >
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={cn(
                    cellBase,
                    "h-10 text-foreground group-last/row:border-b-0",
                    index === 0 && "pl-4 font-medium",
                    column.align === "end" && "text-right tabular-nums",
                    column.className
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
              <td aria-hidden="true" className="border-b border-border-solid group-last/row:border-b-0" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Previous and next page buttons with the current position, shown below a data table */
export function DataTablePagination({
  label,
  page,
  totalPages,
  total,
  onPageChange,
}: {
  label: string;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString("en-US")} total · Page {page} of {Math.max(totalPages, 1)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
