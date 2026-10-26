import {
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  ArrowRightDoubleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { Button } from "./button";
import { ScrollArea } from "./scroll-area";
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
  "border-b border-r border-border-solid px-4 text-left align-middle whitespace-nowrap last:border-r-0";

const MIN_COLUMN_WIDTH = 64;
const KEYBOARD_STEP = 16;

function storageKeyFor(key: string) {
  return `data-table-widths:${key}`;
}

/** Column widths someone has dragged, kept in this browser; empty when storage is unavailable */
function readSavedWidths(key: string): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKeyFor(key)) ?? "{}");
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resizable columns. Each column starts at its natural width, measured once from the header; from
 * then on the table uses fixed widths, and any a person drags are saved under `storageKey` so the
 * table reopens the same way.
 */
function useColumnWidths(storageKey: string, columnKeys: readonly string[]) {
  const [saved, setSaved] = useState(() => readSavedWidths(storageKey));
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const headers = useRef(new Map<string, HTMLTableCellElement>());

  const widthOf = (key: string) => saved[key] ?? measured[key];
  const ready = columnKeys.every((key) => widthOf(key) !== undefined);

  // While any width is unknown the table lays out naturally; measure it then
  // biome-ignore lint/correctness/useExhaustiveDependencies: measures whenever widths go missing
  useLayoutEffect(() => {
    if (ready) return;
    const next: Record<string, number> = {};
    for (const key of columnKeys) {
      const header = headers.current.get(key);
      // Rounded up, plus the column's border, so the text that fitted still fits
      if (header) next[key] = Math.ceil(header.getBoundingClientRect().width) + 1;
    }
    setMeasured(next);
  }, [ready, columnKeys.join("|")]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKeyFor(storageKey), JSON.stringify(saved));
    } catch {
      // Storage can be unavailable (such as in private windows); widths still work for the visit
    }
  }, [saved, storageKey]);

  const setWidth = (key: string, width: number) =>
    setSaved((previous) => ({ ...previous, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) }));

  /** Back to the column's natural width (the table measures every column again) */
  const resetWidth = (key: string) => {
    setSaved(({ [key]: _removed, ...rest }) => rest);
    setMeasured({});
  };

  return { widthOf, ready, setWidth, resetWidth, headers };
}

/** The drag handle on a column's right border */
function ResizeHandle({
  label,
  width,
  onResize,
  onReset,
}: {
  label: string;
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a draggable column border, not a visual divider
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuenow={width}
      tabIndex={0}
      className={cn(
        // Inside the column (cells clip what overflows), with the highlight on its border
        "absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none outline-none",
        "after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:transition-colors hover:after:bg-primary/60 focus-visible:after:bg-primary"
      )}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onResize(width - KEYBOARD_STEP);
        else if (event.key === "ArrowRight") onResize(width + KEYBOARD_STEP);
        else return;
        event.preventDefault();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const move = (moveEvent: PointerEvent) => onResize(width + moveEvent.clientX - startX);
        const stop = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", stop);
          document.body.style.removeProperty("cursor");
          document.body.style.removeProperty("user-select");
        };
        // Keep the resize cursor, and stop text selecting, while dragging past the handle
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
      }}
    />
  );
}

/**
 * Spreadsheet-like record table (after qargo's): a hairline grid as wide as its columns, scrolling
 * sideways when they don't fit. The last row and column have no outer line, so the table sits flush
 * in a bordered container. The
 * first cell of each row should hold the row's link or button. While `loading`, the header shows
 * with rows of skeleton cells in place of the data. Columns resize by dragging their right border
 * (double-click it to reset), and keep their widths per `storageKey`.
 */
export function DataTable<T>({
  label,
  rows,
  columns,
  getKey,
  onRowClick,
  loading = false,
  skeletonRows = 5,
  storageKey,
  fullWidth = false,
}: {
  label: string;
  /** Fill the container: the last column takes whatever room the others leave */
  fullWidth?: boolean;
  /** Where dragged column widths are remembered; tables sharing a key share widths. Defaults to the label */
  storageKey?: string;
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  /** How many skeleton rows to show while loading */
  skeletonRows?: number;
}) {
  const { widthOf, ready, setWidth, resetWidth, headers } = useColumnWidths(
    storageKey ?? label,
    columns.map((column) => column.key)
  );
  const totalWidth = ready
    ? columns.reduce((sum, column) => sum + (widthOf(column.key) ?? 0), 0)
    : undefined;

  return (
    // Scrolls sideways on its own thin scrollbar when the columns don't fit
    <ScrollArea orientation="horizontal" className="max-w-full min-w-0">
      <table
        aria-label={label}
        aria-busy={loading || undefined}
        className="w-max border-separate border-spacing-0 text-sm"
        // Once every width is known the table keeps to them, cutting off what doesn't fit
        style={
          ready
            ? { tableLayout: "fixed", width: fullWidth ? `max(${totalWidth}px, 100%)` : totalWidth }
            : fullWidth
              ? { width: "100%" }
              : undefined
        }
      >
        {ready && (
          <colgroup>
            {columns.map((column, index) => (
              <col
                key={column.key}
                // A full-width table's last column has no set width, so it takes up the rest
                style={
                  fullWidth && index === columns.length - 1
                    ? undefined
                    : { width: widthOf(column.key) }
                }
              />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={column.key}
                ref={(element) => {
                  if (element) headers.current.set(column.key, element);
                  else headers.current.delete(column.key);
                }}
                scope="col"
                className={cn(
                  cellBase,
                  "relative h-11 font-normal text-foreground",
                  ready ? "overflow-hidden text-ellipsis" : index === 0 && "w-72 min-w-56",
                  column.align === "end" && "text-right",
                  !ready && column.className
                )}
              >
                {column.header}
                {ready && !(fullWidth && index === columns.length - 1) && (
                  <ResizeHandle
                    label={typeof column.header === "string" ? column.header : column.key}
                    width={widthOf(column.key) ?? 0}
                    onResize={(width) => setWidth(column.key, width)}
                    onReset={() => resetWidth(column.key)}
                  />
                )}
              </th>
            ))}
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
                      "h-12 group-last/row:border-b-0",
                      ready ? "overflow-hidden" : column.className
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
              </tr>
            ))}
          {!loading &&
            rows.map((row) => (
              <tr
                key={getKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "group/row transition-colors hover:bg-muted/60",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      cellBase,
                      "h-12 text-foreground group-last/row:border-b-0",
                      ready && "overflow-hidden text-ellipsis",
                      column.align === "end" && "text-right tabular-nums",
                      !ready && column.className
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

// First, previous, next and last, as icon buttons shaped like the console's other small icon buttons
const PAGE_BUTTONS = [
  {
    label: "First page",
    icon: ArrowLeftDoubleIcon,
    target: () => 1,
    isDisabled: (page: number) => page <= 1,
  },
  {
    label: "Previous page",
    icon: ArrowLeft01Icon,
    target: (page: number) => page - 1,
    isDisabled: (page: number) => page <= 1,
  },
  {
    label: "Next page",
    icon: ArrowRight01Icon,
    target: (page: number) => page + 1,
    isDisabled: (page: number, totalPages: number) => page >= totalPages,
  },
  {
    label: "Last page",
    icon: ArrowRightDoubleIcon,
    target: (_page: number, totalPages: number) => totalPages,
    isDisabled: (page: number, totalPages: number) => page >= totalPages,
  },
];

/** First, previous, next and last page buttons with the current position, shown below a data table */
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
      <div className="flex items-center gap-1">
        {PAGE_BUTTONS.map(({ label: buttonLabel, icon, target, isDisabled }) => (
          <Button
            key={buttonLabel}
            variant="ghost"
            size="icon-sm"
            aria-label={buttonLabel}
            disabled={isDisabled(page, totalPages)}
            className="!rounded-sm text-muted-foreground hover:text-foreground"
            onClick={() => onPageChange(target(page, totalPages))}
          >
            <HugeiconsIcon icon={icon} aria-hidden="true" className="size-4" />
          </Button>
        ))}
      </div>
    </nav>
  );
}
