import * as React from "react"
import { cn } from "../../../utils/cn"

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2 pb-0", className)}
      {...props}
    />
  )
}

export { SidebarHeader }
