import { type VariantProps } from "class-variance-authority"
import { cn } from "../../../utils/cn"

import { emptyVariants } from "./shared"

function Empty({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyVariants>) {
  return (
    <div
      data-slot="empty"
      data-variant={variant}
      className={cn(emptyVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Empty }
