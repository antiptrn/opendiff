import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ChangeEventHandler, useEffect, useState } from "react";
import { SearchBar } from "../ui/search-bar";
import { SidebarMenuButton } from "../ui/sidebar";

function isMacPlatform() {
  return typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgent);
}

/**
 * Search for the console top bar: an icon button, the same as the sidebar's collapse button,
 * that opens into a search field. ⌘ (Ctrl off Mac) + `shortcut` opens it too. It closes again on
 * Escape, or when it loses focus while empty.
 */
export function TopBarSearch({
  value,
  onChange,
  placeholder,
  shortcut,
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  /** A letter that opens the search with ⌘ (Ctrl off Mac) */
  shortcut?: string;
}) {
  // Stay open while there is a query, so a filtered list never hides what it's filtered by
  const [open, setOpen] = useState(value !== "");

  useEffect(() => {
    if (!shortcut) return;
    const isMac = isMacPlatform();
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== shortcut.toLowerCase()) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcut]);

  if (!open) {
    return (
      <SidebarMenuButton
        type="button"
        variant="sidebarAction"
        aria-label={placeholder}
        onClick={() => setOpen(true)}
      >
        <span className="flex text-muted-foreground group-hover/menu-button:text-foreground [&>svg]:size-4">
          <HugeiconsIcon icon={Search01Icon} />
        </span>
      </SidebarMenuButton>
    );
  }

  return (
    <SearchBar
      size="sm"
      autoFocus
      containerClassName="w-56"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={() => {
        if (value === "") setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    />
  );
}
