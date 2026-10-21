import * as React from "react"
import { cn } from "../../../utils/cn"

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative max-w-full min-w-0", className)}
      {...props}
    />
  )
}

export { SidebarMenuItem }
