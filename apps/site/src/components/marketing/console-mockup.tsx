import { SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AppPreview } from "./app-preview";

/** Hero product shot: a desktop window showing a live preview of the console */
export function ConsoleMockup() {
  return (
    <div className="flex h-[720px] flex-col overflow-hidden rounded-xl border border-border-solid bg-background-solid">
      <div className="relative flex h-9 shrink-0 items-center border-b border-border-solid px-3.5">
        <div aria-hidden="true" className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        {/* Like a browser's address bar: a shield to show the connection is secure */}
        <div className="absolute inset-x-0 flex justify-center">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <HugeiconsIcon icon={SecurityCheckIcon} className="size-3.5" aria-hidden="true" />
            <span>
              <span className="text-foreground">contrast</span>.sh
            </span>
          </span>
        </div>
      </div>
      {/* Still scrolls, just without visible scrollbars */}
      <div className="flex min-h-0 flex-1 [&_*]:[scrollbar-width:none] [&_*::-webkit-scrollbar]:hidden">
        <AppPreview />
      </div>
    </div>
  );
}
