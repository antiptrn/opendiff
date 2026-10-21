import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "../../../utils/cn"

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-light text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { SheetTitle }
