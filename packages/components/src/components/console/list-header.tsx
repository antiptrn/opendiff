import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../utils";
import type { ReactNode } from "react";

/**
 * The bar across the top of a list box, after GitHub's: tabs on the left, filter and sort menus on
 * the right. The right padding matches the vertical, so the last menu sits as close to the edge as
 * to the top and bottom.
 */
export function ListHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-solid bg-background py-1.5 pr-1.5 pl-4">
      {children}
    </div>
  );
}

/** A tab with its count, such as "Open 3", choosing which part of the list is shown */
export function ListTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={active}
      className={cn(active ? "text-foreground" : "text-muted-foreground")}
      onClick={onClick}
    >
      {label}
      {count !== undefined && (
        <span className="rounded-full bg-muted px-1.5 text-xs leading-5">
          {count.toLocaleString("en-US")}
        </span>
      )}
    </Button>
  );
}

/** The header's Sort menu: one choice from a list */
export function SortMenu<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Sort
          <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-end" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
