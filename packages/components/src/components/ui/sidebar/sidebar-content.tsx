import * as React from "react"
import { cn } from "../../../utils/cn"

function SidebarContent({
  className,
  overflow = "auto",
  spacing = "default",
  ...props
}: React.ComponentProps<"div"> & {
  overflow?: "auto" | "contained"
  spacing?: "default" | "compact"
}) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col group-data-[collapsible=icon]:overflow-hidden",
        spacing === "compact" ? "gap-1" : "gap-0",
        overflow === "auto" ? "overflow-auto" : "overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

export { SidebarContent }
