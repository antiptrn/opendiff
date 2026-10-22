import * as React from "react"
import { cn } from "../../../utils/cn"

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("shrink-0 text-border [&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? "/"}
    </li>
  )
}

export { BreadcrumbSeparator }
