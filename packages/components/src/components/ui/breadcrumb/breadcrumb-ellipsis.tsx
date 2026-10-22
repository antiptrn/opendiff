import * as React from "react"
import { cn } from "../../../utils/cn"
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn(
        "flex size-5 items-center justify-center [&>svg]:size-4",
        className
      )}
      {...props}
    >
      <HugeiconsIcon icon={MoreHorizontalIcon} />
      <span className="sr-only">More</span>
    </span>
  )
}

export { BreadcrumbEllipsis }
