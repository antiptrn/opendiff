import * as React from "react"
import { useIsMobile } from "../../../hooks/use-mobile"
import { cn } from "../../../utils/cn"

import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_WIDTH_ICON,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  clampSidebarWidth,
  storedSidebarWidth,
  storedSidebarOpen,
  type SidebarContextProps,
  SidebarContext,
} from "./shared"

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  persistenceKey,
  keyboardShortcut = SIDEBAR_KEYBOARD_SHORTCUT,
  defaultWidth = SIDEBAR_WIDTH_DEFAULT,
  minWidth = SIDEBAR_WIDTH_MIN,
  maxWidth = SIDEBAR_WIDTH_MAX,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  persistenceKey?: string
  keyboardShortcut?: string | null
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
}) {
  const isMobile = useIsMobile()
  const widthStorageKey = persistenceKey
    ? `${persistenceKey}-width`
    : SIDEBAR_WIDTH_STORAGE_KEY
  const collapsedStorageKey = persistenceKey
    ? `${persistenceKey}-collapsed`
    : SIDEBAR_COLLAPSED_STORAGE_KEY
  const [_openMobile, _setOpenMobile] = React.useState(false)
  const [sidebarWidth, setSidebarWidth] = React.useState(() =>
    storedSidebarWidth(widthStorageKey, minWidth, maxWidth, defaultWidth)
  )
  const [isResizing, setIsResizing] = React.useState(false)
  const [isPeeking, setIsPeeking] = React.useState(false)
  const [isTransitionSuppressed, setIsTransitionSuppressed] =
    React.useState(false)
  const resizeCleanupRef = React.useRef<(() => void) | null>(null)
  const transitionFrameRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    setSidebarWidth((current) => {
      const next = clampSidebarWidth(current, minWidth, maxWidth)
      if (next !== current) {
        window.localStorage.setItem(widthStorageKey, String(next))
      }
      return next
    })
  }, [maxWidth, minWidth, widthStorageKey])

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(() =>
    storedSidebarOpen(defaultOpen, collapsedStorageKey)
  )
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
      window.localStorage.setItem(collapsedStorageKey, String(!openState))
    },
    [collapsedStorageKey, setOpenProp, open]
  )
  const openMobile = openProp ?? _openMobile
  const setOpenMobile = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      const openState = typeof value === "function" ? value(openMobile) : value
      if (setOpenProp) setOpenProp(openState)
      else _setOpenMobile(openState)
    },
    [openMobile, setOpenProp]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  const pinSidebarFromPeek = React.useCallback(() => {
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current)
    }

    setIsTransitionSuppressed(true)
    setIsPeeking(false)
    setOpen(true)
    transitionFrameRef.current = window.requestAnimationFrame(() => {
      transitionFrameRef.current = window.requestAnimationFrame(() => {
        transitionFrameRef.current = null
        setIsTransitionSuppressed(false)
      })
    })
  }, [setOpen])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    if (!keyboardShortcut) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === keyboardShortcut && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [keyboardShortcut, toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"

  const startResize = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, side: "left" | "right") => {
      event.preventDefault()
      resizeCleanupRef.current?.()
      setIsResizing(true)

      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"

      const resize = (pointerEvent: globalThis.PointerEvent) => {
        const rawWidth =
          side === "left"
            ? pointerEvent.clientX
            : window.innerWidth - pointerEvent.clientX
        const nextWidth = clampSidebarWidth(rawWidth, minWidth, maxWidth)
        setSidebarWidth(nextWidth)
        window.localStorage.setItem(widthStorageKey, String(nextWidth))
      }
      const stopResize = () => {
        setIsResizing(false)
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener("pointermove", resize)
        window.removeEventListener("pointerup", stopResize)
        window.removeEventListener("pointercancel", stopResize)
        resizeCleanupRef.current = null
      }

      resizeCleanupRef.current = stopResize
      window.addEventListener("pointermove", resize)
      window.addEventListener("pointerup", stopResize)
      window.addEventListener("pointercancel", stopResize)
    },
    [maxWidth, minWidth, widthStorageKey]
  )

  React.useEffect(
    () => () => {
      resizeCleanupRef.current?.()
      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current)
      }
    },
    []
  )

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      isPeeking,
      isResizing,
      isTransitionSuppressed,
      pinSidebarFromPeek,
      setIsPeeking,
      startResize,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      isPeeking,
      isResizing,
      isTransitionSuppressed,
      pinSidebarFromPeek,
      startResize,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    ]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        data-peeking={isPeeking}
        data-resizing={isResizing}
        data-transition-suppressed={isTransitionSuppressed}
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export { SidebarProvider }
