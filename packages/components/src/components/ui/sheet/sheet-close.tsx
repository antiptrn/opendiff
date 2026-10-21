import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

export { SheetClose }
