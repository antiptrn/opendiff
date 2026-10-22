import * as React from "react"
import { cn } from "../../../utils/cn"

function BreadcrumbItem({
  className,
  spacing = "default",
  truncate = false,
  ...props
}: React.ComponentProps<"li"> & {
  spacing?: "compact" | "default"
  truncate?: boolean
}) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn(
        "inline-flex shrink-0 items-center gap-2",
        spacing === "compact" && "gap-1.5",
        truncate && "min-w-0 shrink overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

export { BreadcrumbItem }
