import * as React from "react"
import { cn } from "../../../utils/cn"

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "ml-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border py-0.5 pl-2.5 group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

export { SidebarMenuSub }
