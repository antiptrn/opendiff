import * as React from "react"
import { cn } from "../../../utils/cn"

function SidebarMenuIcon({
  className,
  isActive = false,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  isActive?: boolean
  variant?: "breadcrumb" | "default" | "disclosure" | "settings"
}) {
  return (
    <div
      data-active={variant === "settings" ? isActive : undefined}
      data-slot="sidebar-menu-icon"
      data-sidebar="menu-icon"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center [&>svg]:size-4 [&>svg]:shrink-0",
        variant === "breadcrumb" && "size-3.5 text-foreground [&>svg]:size-3.5",
        variant === "disclosure" && "relative",
        variant === "settings" && "text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { SidebarMenuIcon }
