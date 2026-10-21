import * as React from "react"
import { cn } from "../../../utils/cn"

function SidebarGroup({
  className,
  spacing = "default",
  ...props
}: React.ComponentProps<"div"> & {
  spacing?: "default" | "compactBottom" | "settingsSection"
}) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn(
        "relative flex w-full min-w-0 flex-col",
        spacing === "settingsSection" ? "px-2 py-1.5" : "p-2",
        spacing === "compactBottom" && "pb-0",
        className
      )}
      {...props}
    />
  )
}

export { SidebarGroup }
