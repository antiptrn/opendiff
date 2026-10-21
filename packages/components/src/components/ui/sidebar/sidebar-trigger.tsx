import * as React from "react"
import { LayoutAlignLeftIcon, LayoutAlignRightIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useSidebar } from "./shared"

import { SidebarMenuButton } from "./sidebar-menu-button"

function SidebarTrigger({
  mode = "toggle",
  side = "left",
  onClick,
  ...props
}: React.ComponentProps<typeof SidebarMenuButton> & {
  mode?: "toggle" | "collapse"
  side?: "left" | "right"
}) {
  const {
    isMobile,
    isPeeking,
    openMobile,
    pinSidebarFromPeek,
    state,
    toggleSidebar,
  } = useSidebar()
  const sidebarLabel = side === "right" ? "right sidebar" : "sidebar"
  const label =
    side === "right"
      ? (isMobile ? openMobile : state === "expanded")
        ? "Hide sidebar"
        : "Open sidebar"
      : mode === "collapse"
        ? isMobile
          ? `Collapse ${sidebarLabel}`
          : state === "collapsed"
            ? `Pin ${sidebarLabel}`
            : `Collapse ${sidebarLabel}`
        : isMobile
          ? openMobile
            ? `Collapse ${sidebarLabel}`
            : `Expand ${sidebarLabel}`
          : state === "collapsed"
            ? `Pin ${sidebarLabel}`
            : `Collapse ${sidebarLabel}`
  return (
    <SidebarMenuButton
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="sidebarAction"
      tooltip={label}
      tooltipVisibility="always"
      aria-label={label}
      aria-keyshortcuts={side === "left" ? "Meta+B Control+B" : undefined}
      isActive={side === "right" && state === "expanded"}
      onClick={(event) => {
        onClick?.(event)
        if (
          !isMobile &&
          side === "left" &&
          state === "collapsed" &&
          isPeeking
        ) {
          pinSidebarFromPeek()
          return
        }
        toggleSidebar()
      }}
      {...props}
    >
      <span className="flex text-muted-foreground group-hover/menu-button:text-foreground group-data-active/menu-button:text-foreground [&>svg]:size-4">
        <HugeiconsIcon icon={side === "right" ? LayoutAlignRightIcon : LayoutAlignLeftIcon} />
      </span>
      <span className="sr-only">{label}</span>
    </SidebarMenuButton>
  )
}

export { SidebarTrigger }
