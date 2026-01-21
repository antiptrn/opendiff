"use client"

import * as React from "react"
import { Tooltip } from "@base-ui/react"

import { cn } from "@/lib/utils"

const TooltipProvider = Tooltip.Provider

const TooltipRoot = Tooltip.Root

const TooltipTrigger = Tooltip.Trigger

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Tooltip.Popup> & {
    sideOffset?: number
  }
>(({ className, sideOffset = 4, children, ...props }, ref) => (
  <Tooltip.Portal>
    <Tooltip.Positioner sideOffset={sideOffset}>
      <Tooltip.Popup
        ref={ref}
        className={cn(
          "z-50 max-w-xs rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      >
        {children}
      </Tooltip.Popup>
    </Tooltip.Positioner>
  </Tooltip.Portal>
))
TooltipContent.displayName = "TooltipContent"

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent }
