import * as React from "react"
import { cn } from "../../../utils/cn"

function PanelResizeHandle({
  ariaLabel,
  isResizing,
  onPointerDown,
  position = "attached",
  side,
}: {
  ariaLabel: string
  isResizing: boolean
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>
  position?: "attached" | "viewport"
  side: "left" | "right"
}) {
  return (
    <button
      type="button"
      data-slot="sidebar-resize-handle"
      data-resizing={isResizing}
      aria-label={ariaLabel}
      className={cn(
        "group/resize inset-y-0 hidden w-3 cursor-col-resize bg-transparent p-0 outline-none md:block",
        // Above the sidebar and page, below popovers, menus and dialogs (z-50)
        position === "viewport" ? "fixed z-40" : "absolute z-30",
        position === "viewport"
          ? side === "left"
            ? "left-(--sidebar-width) -translate-x-1/2"
            : "right-(--sidebar-width) translate-x-1/2"
          : side === "left"
            ? "-right-1.5"
            : "-left-1.5"
      )}
      onPointerDown={onPointerDown}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 transition-colors duration-300 ease-out md:block",
          isResizing
            ? "bg-yellow transition-none"
            : "bg-transparent group-hover/resize:bg-yellow group-focus-visible/resize:bg-yellow"
        )}
      />
    </button>
  )
}

export { PanelResizeHandle }
