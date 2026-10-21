import * as React from "react"
import { cva } from "class-variance-authority"

const SIDEBAR_COOKIE_NAME = "sidebar_state"

const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

const SIDEBAR_WIDTH_MOBILE = "18rem"

const SIDEBAR_WIDTH_ICON = "3rem"

const SIDEBAR_KEYBOARD_SHORTCUT = "b"

const SIDEBAR_COLLAPSED_STORAGE_KEY = "run.sidebar-collapsed"

const SIDEBAR_WIDTH_STORAGE_KEY = "run.sidebar-width"

const SIDEBAR_WIDTH_DEFAULT = 256

const SIDEBAR_WIDTH_MIN = 200

const SIDEBAR_WIDTH_MAX = 380

const TRAFFIC_BUTTONS_SAFE_AREA = 94

function clampSidebarWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(Math.max(width, minWidth), maxWidth)
}

function storedSidebarWidth(
  storageKey: string,
  minWidth: number,
  maxWidth: number,
  defaultWidth: number
) {
  const fallbackWidth = clampSidebarWidth(defaultWidth, minWidth, maxWidth)
  if (typeof window === "undefined") return fallbackWidth
  const width = Number(window.localStorage.getItem(storageKey))
  return Number.isFinite(width) && width >= minWidth && width <= maxWidth
    ? width
    : fallbackWidth
}

function storedSidebarOpen(defaultOpen: boolean, storageKey: string) {
  if (typeof window === "undefined") return defaultOpen
  const collapsed = window.localStorage.getItem(storageKey)
  return collapsed === null ? defaultOpen : collapsed !== "true"
}

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  openMobile: boolean
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>
  isMobile: boolean
  isPeeking: boolean
  isResizing: boolean
  isTransitionSuppressed: boolean
  pinSidebarFromPeek: () => void
  setIsPeeking: React.Dispatch<React.SetStateAction<boolean>>
  startResize: (
    event: React.PointerEvent<HTMLButtonElement>,
    side: "left" | "right"
  ) => void
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex items-center overflow-hidden rounded-md p-2 text-left text-sm font-light outline-hidden transition-[width,height] duration-200 ease-out [--avatar-group-ring:var(--sidebar)] group-has-[>[data-sidebar=menu-action]]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-foreground hover:[--avatar-group-ring:var(--muted-solid)] active:bg-sidebar-accent active:text-foreground active:[--avatar-group-ring:var(--muted-solid)] disabled:pointer-events-none disabled:opacity-50 has-[~[data-sidebar=menu-action]]:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:hover:[--avatar-group-ring:var(--muted-solid-light)] dark:active:[--avatar-group-ring:var(--muted-solid-light)] data-open:hover:bg-sidebar-accent data-open:hover:text-foreground data-open:hover:[--avatar-group-ring:var(--muted-solid)] dark:data-open:hover:[--avatar-group-ring:var(--muted-solid-light)] data-active:bg-sidebar-accent data-active:text-foreground data-active:[--avatar-group-ring:var(--muted-solid)] data-active:hover:text-foreground dark:data-active:[--avatar-group-ring:var(--muted-solid-light)] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-sm text-foreground hover:bg-sidebar-accent hover:text-foreground",
        primaryNavigation:
          "rounded-sm text-foreground hover:bg-sidebar-accent hover:text-foreground",
        settings:
          "rounded-sm text-foreground hover:bg-sidebar-accent hover:text-foreground",
        settingsBack:
          "rounded-sm text-foreground hover:bg-sidebar-accent hover:text-foreground active:text-foreground",
        account:
          "rounded-sm text-foreground hover:bg-sidebar-accent hover:text-foreground active:text-foreground data-open:text-foreground",
        accountCompact:
          "rounded-sm text-foreground hover:bg-sidebar-accent hover:text-foreground active:text-foreground data-open:text-foreground",
        accountCompactPlain:
          "rounded-sm text-muted-foreground transition-all hover:bg-transparent hover:text-foreground active:bg-transparent active:text-foreground data-open:bg-transparent data-open:text-foreground data-open:hover:bg-transparent",
        sidebarAction:
          "size-7! rounded-sm p-1.5! font-light text-foreground hover:bg-sidebar-accent hover:text-foreground active:text-foreground data-open:text-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground",
        searchResult:
          "rounded-none text-foreground hover:bg-sidebar-accent hover:text-foreground",
        outline:
          "bg-background text-foreground shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "h-8 text-sm",
        compact: "h-7 text-sm",
        sm: "h-7 text-xs",
        md: "h-9 text-sm",
        lg: "h-12.5 text-sm group-data-[collapsible=icon]:p-0!",
        searchResult: "h-8 text-sm duration-200 data-[expanded=true]:h-12.5",
      },
      spacing: {
        default: "gap-2",
        account: "gap-2.5",
        accountCompact: "gap-2 [&>span:last-child]:-ml-1",
        accountCompactPlain: "gap-2",
      },
      labelOverflow: {
        truncate: "[&>span:last-child]:truncate",
        custom: "",
      },
      width: {
        full: "w-full",
        content: "w-fit max-w-full pr-3",
        contentCompact: "w-fit max-w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      spacing: "default",
      labelOverflow: "truncate",
      width: "full",
    },
  }
)

export {
  useSidebar,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_WIDTH_ICON,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  TRAFFIC_BUTTONS_SAFE_AREA,
  clampSidebarWidth,
  storedSidebarWidth,
  storedSidebarOpen,
  SidebarContext,
  SIDEBAR_WIDTH_MOBILE,
  sidebarMenuButtonVariants,
}

export type { SidebarContextProps }
