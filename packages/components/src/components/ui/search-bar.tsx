import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { cn } from "../../utils/cn";
import { Badge } from "./badge";
import { Input } from "./input";

interface SearchBarProps extends Omit<React.ComponentProps<typeof Input>, "type" | "size"> {
  containerClassName?: string;
  iconClassName?: string;
  /** "sm" fits inside the console top bar */
  size?: "default" | "sm";
  /** A letter that focuses the search with ⌘ (Ctrl off Mac), shown in a badge at the right */
  shortcut?: string;
  /** Show the shortcut badge; turn off to keep the shortcut but hide its hint */
  showShortcut?: boolean;
}

function isMacPlatform() {
  return typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgent);
}

export function SearchBar({
  containerClassName,
  iconClassName,
  className,
  size = "default",
  shortcut,
  showShortcut = true,
  ...props
}: SearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isMac = React.useMemo(isMacPlatform, []);

  // ⌘/Ctrl + the shortcut letter focuses the search instead of opening the browser's find bar
  React.useEffect(() => {
    if (!shortcut) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== shortcut.toLowerCase()) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcut, isMac]);

  return (
    <div className={cn("relative w-full", containerClassName)}>
      <HugeiconsIcon icon={Search01Icon}
        strokeWidth={2}
        className={cn(
          "absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
          size === "sm" ? "left-3" : "left-3.5",
          iconClassName
        )}
      />
      {/* Button heights rather than the taller form input: h-10 like a default Button, and "sm"
          34px like a small one, so it lines up with them in the top bar and toolbars */}
      <Input
        ref={inputRef}
        type="text"
        aria-keyshortcuts={shortcut ? `${isMac ? "Meta" : "Control"}+${shortcut.toUpperCase()}` : undefined}
        className={cn(
          "text-sm placeholder:text-sm",
          size === "sm" ? "h-8.5 rounded-md pr-3 pl-9" : "h-10 rounded-full pl-10",
          shortcut && showShortcut && "pr-14",
          className
        )}
        {...props}
      />
      {shortcut && showShortcut && (
        <Badge
          variant="secondary"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
        >
          {isMac ? "⌘" : "Ctrl "}
          {shortcut.toUpperCase()}
        </Badge>
      )}
    </div>
  );
}
