import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "../../../utils/cn"

function SidebarGroupLabel({
  className,
  render,
  variant = "default",
  ...props
}: useRender.ComponentProps<"div"> &
  React.ComponentProps<"div"> & {
    variant?: "default" | "session"
  }) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-light text-sidebar-foreground/70 outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0",
          variant === "session" &&
            "h-7 w-full justify-start gap-1 pb-1 text-left text-sm font-light text-muted-foreground transition-none hover:text-foreground",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-group-label",
      sidebar: "group-label",
      variant,
    },
  })
}

export { SidebarGroupLabel }
