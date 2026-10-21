import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "../../../utils/cn"

function SidebarMenuAction({
  alignment = "center",
  className,
  radius = "default",
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    alignment?: "center" | "firstLine"
    radius?: "default" | "sm"
    showOnHover?: boolean
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-1.5 right-1.5 flex aspect-square w-5 items-center justify-center p-0 text-sidebar-foreground outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          alignment === "firstLine" && "top-1.5!",
          radius === "sm" ? "rounded-xs" : "rounded-xs",
          showOnHover &&
          "peer-hover/menu-button:opacity-100 peer-focus-visible/menu-button:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 md:opacity-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-action",
      sidebar: "menu-action",
    },
  })
}

export { SidebarMenuAction }
