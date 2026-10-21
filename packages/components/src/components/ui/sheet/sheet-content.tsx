import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "../../../utils/cn"
import { Button } from "../button"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { SheetContentVariant } from "./shared"

import { SheetPortal } from "./sheet-portal"

import { SheetOverlay } from "./sheet-overlay"

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  variant = "default",
  topOffset = 0,
  style,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  variant?: SheetContentVariant
  topOffset?: number
}) {
  const contentStyle =
    variant === "mobile-menu"
      ? ({
          ...style,
          "--sheet-mobile-menu-top": `${topOffset}px`,
        } as unknown as React.CSSProperties)
      : style

  return (
    <SheetPortal>
      {variant === "default" ? <SheetOverlay /> : null}
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={variant === "default" ? side : undefined}
        data-variant={variant}
        className={cn(
          variant === "mobile-menu"
            ? "fixed inset-x-0 top-[var(--sheet-mobile-menu-top)] bottom-0 z-50 flex w-full flex-col overflow-y-auto overscroll-contain bg-background text-base text-foreground outline-none"
            : "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        style={contentStyle}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

export { SheetContent }
