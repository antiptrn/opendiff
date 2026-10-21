import * as React from "react"
import { cn } from "../../../utils/cn"
import { Separator } from "../separator"

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("w-full bg-sidebar-border", className)}
      {...props}
    />
  )
}

export { SidebarSeparator }
