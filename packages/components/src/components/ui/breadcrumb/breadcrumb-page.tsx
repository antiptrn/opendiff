import * as React from "react"
import { cn } from "../../../utils/cn"

function BreadcrumbPage({
  className,
  inset = "none",
  truncate = false,
  ...props
}: React.ComponentProps<"span"> & {
  inset?: "button" | "none"
  truncate?: boolean
}) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn(
        "font-normal text-foreground",
        inset === "button" && "ml-2",
        truncate && "block min-w-0 truncate",
        className
      )}
      {...props}
    />
  )
}

export { BreadcrumbPage }
