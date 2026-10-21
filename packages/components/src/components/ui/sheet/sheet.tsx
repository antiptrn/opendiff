import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

export { Sheet }
