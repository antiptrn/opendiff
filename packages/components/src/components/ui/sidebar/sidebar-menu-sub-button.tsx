import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "../../../utils/cn"

import { useSidebarActiveState } from "./use-sidebar-active-state"

function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  variant = "default",
  className,
  ...props
}: useRender.ComponentProps<"a"> &
  React.ComponentProps<"a"> & {
    size?: "sm" | "md"
    isActive?: boolean
    variant?: "default" | "settings"
  }) {
  const renderedActive = useSidebarActiveState(isActive)

  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "flex h-7 w-full min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 font-light text-foreground outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-foreground active:bg-sidebar-accent active:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-foreground",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-sub-button",
      sidebar: "menu-sub-button",
      size,
      active: renderedActive,
      variant,
    },
  })
}

export { SidebarMenuSubButton }
