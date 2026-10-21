import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { type VariantProps } from "class-variance-authority"
import { cn } from "../../../utils/cn"
import { TooltipContent, TooltipRoot, TooltipTrigger } from "../tooltip"

import { useSidebar, sidebarMenuButtonVariants } from "./shared"

import { useSidebarActiveState } from "./use-sidebar-active-state"

function SidebarMenuButton({
  ref,
  render,
  isActive = false,
  variant = "default",
  size = "default",
  spacing = "default",
  labelOverflow = "truncate",
  width = "full",
  tooltip,
  tooltipVisibility = "collapsed",
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
    tooltipVisibility?: "always" | "collapsed"
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar()
  const renderedActive = useSidebarActiveState(isActive)
  const comp = useRender({
    defaultTagName: "button",
    ref,
    props: mergeProps<"button">(
      {
        className: cn(
          sidebarMenuButtonVariants({
            variant,
            size,
            spacing,
            labelOverflow,
            width,
          }),
          className
        ),
      },
      props
    ),
    render: !tooltip ? render : <TooltipTrigger render={render} />,
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: renderedActive,
    },
  })

  if (!tooltip) {
    return comp
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <TooltipRoot>
      {comp}
      <TooltipContent
        side="bottom"
        hidden={
          isMobile ||
          (tooltipVisibility === "collapsed" && state !== "collapsed")
        }
        {...tooltip}
      />
    </TooltipRoot>
  )
}

export { SidebarMenuButton }
