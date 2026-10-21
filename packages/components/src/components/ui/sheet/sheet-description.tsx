import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "../../../utils/cn"

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export { SheetDescription }
