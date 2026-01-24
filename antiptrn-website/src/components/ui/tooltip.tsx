"use client"

import * as React from "react"
import { Tooltip } from "@base-ui/react"

import { cn } from "@/lib/utils"

const TooltipProvider = Tooltip.Provider

// Wrapper for TooltipRoot with delay prop
// Note: Base UI Tooltip.Root doesn't support delay directly, but we keep the prop
// for API consistency - delay is handled by the Positioner or provider in base-ui
function TooltipRoot({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  delay,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Tooltip.Root> & {
  delay?: number;
}) {
  return (
    <Tooltip.Root {...props}>
      {children}
    </Tooltip.Root>
  );
}

// Wrapper for TooltipTrigger with asChild prop (maps to render)
function TooltipTrigger({
  asChild,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Tooltip.Trigger> & {
  asChild?: boolean;
}) {
  if (asChild && React.isValidElement(children)) {
    return (
      <Tooltip.Trigger
        render={children}
        {...props}
      />
    );
  }
  return (
    <Tooltip.Trigger {...props}>
      {children}
    </Tooltip.Trigger>
  );
}

type Side = "top" | "right" | "bottom" | "left";

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Tooltip.Popup> & {
    sideOffset?: number;
    side?: Side;
  }
>(({ className, sideOffset = 4, side = "top", children, ...props }, ref) => (
  <Tooltip.Portal>
    <Tooltip.Positioner sideOffset={sideOffset} side={side}>
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
