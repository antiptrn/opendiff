import { cva } from "class-variance-authority"

const emptySmallVariant =
  "flex-none gap-2 rounded-none bg-transparent px-2 py-8 text-muted-foreground [&_[data-slot=empty-header]]:gap-2 [&_[data-slot=empty-icon]]:mb-0 [&_[data-slot=empty-icon]_svg]:size-5 [&_[data-slot=empty-title]]:text-sm"

const emptyVariants = cva(
  "m-auto flex min-w-0 flex-col items-center justify-center gap-4 rounded-lg p-6 text-center text-balance",
  {
    variants: {
      variant: {
        default: "rounded-xl border border-border-solid bg-background text-card-foreground",
        outline:
          "border border-dashed bg-background text-card-foreground dark:bg-muted-light",
        border:
          "border bg-background p-8 text-card-foreground dark:bg-muted-light",
        plain: "bg-transparent text-card-foreground",
        panel: "size-full rounded-none bg-transparent text-card-foreground",
        compact: emptySmallVariant,
        sm: emptySmallVariant,
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const emptyMediaVariants = cva(
  "mb-2.5 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        // Room for the illustration EmptyMedia draws around the icon
        icon: "relative mb-3 flex h-32 w-60 items-center justify-center",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export { emptyVariants, emptyMediaVariants }
