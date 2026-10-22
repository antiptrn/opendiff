import * as React from "react"
import { cn } from "../../../utils/cn"

function BreadcrumbList({
  className,
  inset = "interactive",
  overflow = "wrap",
  ...props
}: React.ComponentProps<"ol"> & {
  inset?: "interactive" | "none"
  overflow?: "truncate" | "wrap"
}) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex items-center gap-3 text-sm font-normal wrap-break-word text-foreground",
        overflow === "wrap"
          ? "flex-wrap"
          : "min-w-0 flex-nowrap overflow-hidden",
        overflow === "truncate" && inset === "interactive" && "-mx-2 px-2",
        className
      )}
      {...props}
    />
  )
}

export { BreadcrumbList }
