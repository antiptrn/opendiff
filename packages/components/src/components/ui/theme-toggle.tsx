import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { Button } from "./button";

/** Icon button that flips between light and dark: a sun in light mode, a moon in dark mode */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <span className="dark:hidden">
        <HugeiconsIcon icon={Sun03Icon} />
      </span>
      <span className="hidden dark:inline">
        <HugeiconsIcon icon={Moon02Icon} />
      </span>
    </Button>
  );
}
