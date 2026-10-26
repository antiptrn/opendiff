import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { SearchBar } from "../ui/search-bar";
import { cn } from "../../utils";
import { useState } from "react";

interface FilterPopoverProps {
  /** The trigger's text, such as "Author" */
  label: string;
  /** The heading inside, such as "Filter by author" */
  title: string;
  options: readonly string[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
  /** Shown beside each option, such as an avatar */
  renderIcon?: (option: string) => React.ReactNode;
}

/**
 * A header menu that filters the list by several values at once, after GitHub's label filter:
 * a search box over a list of options, each with a checkbox
 */
export function FilterPopover({
  label,
  title,
  options,
  selected,
  onChange,
  renderIcon,
}: FilterPopoverProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const shown = query ? options.filter((option) => option.toLowerCase().includes(query)) : options;

  const toggle = (option: string) =>
    onChange(
      selected.includes(option)
        ? selected.filter((value) => value !== option)
        : [...selected, option]
    );

  return (
    <Popover onOpenChange={(open) => !open && setSearch("")}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(selected.length > 0 ? "text-foreground" : "text-muted-foreground")}
        >
          {label}
          {selected.length > 0 && <span>({selected.length})</span>}
          <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-end" className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 bg-background p-0">
        <div className="space-y-2 border-b border-border-solid p-2">
          <p className="px-1 text-sm">{title}</p>
          <SearchBar
            size="sm"
            variant="muted"
            autoFocus
            placeholder={`Filter ${label.toLowerCase()}s`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing matches</p>
          ) : (
            shown.map((option) => (
              // Each row is a label, so clicking anywhere on it toggles its checkbox
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={selected.includes(option)}
                  onCheckedChange={() => toggle(option)}
                />
                {renderIcon?.(option)}
                <span className="min-w-0 truncate">{option}</span>
              </label>
            ))
          )}
        </div>
        {selected.length > 0 && (
          <div className="border-t border-border-solid p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full !rounded-sm text-muted-foreground"
              onClick={() => onChange([])}
            >
              Clear filter
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
