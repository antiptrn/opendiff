import * as React from "react"
import { cn } from "../../../utils/cn"

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2 pt-0", className)}
      {...props}
    />
  )
}

export { SidebarFooter }
