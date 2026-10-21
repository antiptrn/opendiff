import * as React from "react"
import { motion, type HTMLMotionProps } from "framer-motion"
import { cn } from "../../../utils/cn"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../sheet"

import { SIDEBAR_WIDTH_MOBILE, useSidebar } from "./shared"

import { SidebarResizeHandle } from "./sidebar-resize-handle"

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  peekable = true,
  fullscreen = false,
  fullscreenResizing = false,
  fullscreenWidth,
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
  peekable?: boolean
  fullscreen?: boolean
  fullscreenResizing?: boolean
  fullscreenWidth?: number | string
}) {
  const {
    isMobile,
    state,
    isPeeking,
    isResizing,
    isTransitionSuppressed,
    openMobile,
    setIsPeeking,
    setOpenMobile,
  } = useSidebar()
  const [isPeekLayerActive, setIsPeekLayerActive] = React.useState(false)
  React.useEffect(() => {
    if (peekable && state === "collapsed" && collapsible === "offcanvas") {
      return
    }
    setIsPeeking(false)

    if (state === "expanded" && isPeekLayerActive) {
      const timeout = window.setTimeout(() => {
        setIsPeekLayerActive(false)
      }, 200)
      return () => window.clearTimeout(timeout)
    }

    setIsPeekLayerActive(false)
  }, [collapsible, isPeekLayerActive, peekable, setIsPeeking, state])
  const revealPeek = React.useCallback(() => {
    setIsPeekLayerActive(true)
    setIsPeeking(true)
  }, [setIsPeeking])
  const dismissPeek = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const ownerDocument = event.currentTarget.ownerDocument
      const KeyboardEventConstructor = ownerDocument.defaultView?.KeyboardEvent

      if (KeyboardEventConstructor) {
        ownerDocument.dispatchEvent(
          new KeyboardEventConstructor("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
            cancelable: true,
          })
        )
      }

      setIsPeeking(false)
    },
    [setIsPeeking]
  )
  const expandedWidth =
    fullscreen && fullscreenWidth !== undefined
      ? typeof fullscreenWidth === "number"
        ? `calc(${fullscreenWidth}px + 1px)`
        : fullscreenWidth
      : fullscreen
        ? "calc(100% + 1px)"
        : "var(--sidebar-width)"

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          // Same edge border as the fixed sidebar
          variant === "sidebar" &&
            (side === "left" ? "border-r border-border-solid" : "border-l border-border-solid"),
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          dir={dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={
            {
              "--sidebar-width": fullscreen ? "100vw" : SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-fullscreen={fullscreen}
      data-peeking={isPeeking}
      data-peek-layer-active={isPeekLayerActive}
      data-slot="sidebar"
    >
      {peekable && state === "collapsed" && collapsible === "offcanvas" ? (
        <div
          aria-hidden="true"
          data-slot="sidebar-hover-edge"
          onPointerEnter={revealPeek}
          className={cn(
            "fixed inset-y-0 w-2 [-webkit-app-region:no-drag] group-data-[peeking=true]:pointer-events-none",
            side === "left" ? "left-0 z-[60]" : "right-0 z-20"
          )}
        />
      ) : null}
      {isPeeking && state === "collapsed" && collapsible === "offcanvas" ? (
        <div
          aria-hidden="true"
          data-slot="sidebar-peek-dismiss"
          onPointerEnter={dismissPeek}
          className={cn(
            "fixed inset-y-0 z-[59] [-webkit-app-region:no-drag]",
            side === "left"
              ? "right-0 left-(--sidebar-width)"
              : "right-(--sidebar-width) left-0"
          )}
        />
      ) : null}
      {/* This is what handles the sidebar gap on desktop */}
      <motion.div
        data-slot="sidebar-gap"
        initial={false}
        animate={
          collapsible === "offcanvas"
            ? {
                width: state === "expanded" ? "var(--sidebar-width)" : 0,
              }
            : undefined
        }
        transition={{
          duration: isResizing ? 0 : 0.2,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={cn(
          "relative w-(--sidebar-width) bg-transparent",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <motion.div
        data-slot="sidebar-container"
        data-side={side}
        initial={false}
        animate={{
          x:
            state === "expanded" || isPeeking
              ? "0%"
              : side === "left"
                ? "-100%"
                : "100%",
          width: expandedWidth,
        }}
        transition={{
          duration:
            isResizing || fullscreenResizing || isTransitionSuppressed
              ? 0
              : 0.2,
          ease: [0.22, 1, 0.36, 1],
        }}
        onAnimationComplete={() => {
          if (!isPeeking && state === "collapsed") {
            setIsPeekLayerActive(false)
          }
        }}
        className={cn(
          "fixed inset-y-0 hidden h-svh w-(--sidebar-width) will-change-transform data-[side=left]:left-0 data-[side=right]:right-0 md:flex",
          state === "collapsed" &&
            "overflow-hidden [-webkit-app-region:no-drag]",
          fullscreen
            ? "z-50"
            : isPeekLayerActive && side === "left"
              ? "z-[60]"
              : state === "collapsed"
                ? "z-40"
                : "z-10",
          "transition-[border-color] duration-150",
          side === "right" && fullscreen
            ? "border-transparent delay-75"
            : "border-border-solid delay-0",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...(props as HTMLMotionProps<"div">)}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className={cn(
            "relative z-10 flex size-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm",
            state === "collapsed" ? "bg-background-solid" : "bg-sidebar"
          )}
        >
          {children}
        </div>
      </motion.div>
      {state === "expanded" && !fullscreen ? (
        <SidebarResizeHandle side={side} />
      ) : null}
    </div>
  )
}

export { Sidebar }
