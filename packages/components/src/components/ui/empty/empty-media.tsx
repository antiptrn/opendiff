import { type VariantProps } from "class-variance-authority"
import { cn } from "../../../utils/cn"

import { emptyMediaVariants } from "./shared"

/**
 * The placeholder rows, back to front so the front one paints last: how far each sits from the
 * top, how far in from the sides, how strongly it shows and how long its title bar is
 */
const ROWS = [
  { top: 80, inset: 24, opacity: 0.25, bar: "w-16" },
  { top: 44, inset: 12, opacity: 0.55, bar: "w-20" },
  { top: 0, inset: 0, opacity: 1, bar: "w-24" },
]

/**
 * The picture above an empty state. "icon" draws a small list that has nothing in it yet: blank
 * rows stacked and fading away. It takes no children. "default" shows its children as they are.
 */
function EmptyMedia({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  if (variant !== "icon") {
    return (
      <div
        data-slot="empty-icon"
        data-variant={variant}
        className={cn(emptyMediaVariants({ variant, className }))}
        {...props}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
      >
        {ROWS.map(({ top, inset, opacity, bar }) => (
          <div
            key={top}
            className="absolute flex items-center gap-3 rounded-lg border border-border-solid bg-background p-2.5"
            style={{ top: top + 8, left: inset, right: inset, opacity }}
          >
            <div className="size-7 shrink-0 rounded-sm bg-muted" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className={cn("h-1.5 rounded-xs bg-muted", bar)} />
              <div className="h-1.5 w-full max-w-28 rounded-xs bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export { EmptyMedia }
