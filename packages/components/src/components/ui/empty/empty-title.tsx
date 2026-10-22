import { cn } from "../../../utils/cn"

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("font-heading text-[15px] font-light", className)}
      {...props}
    />
  )
}

export { EmptyTitle }
