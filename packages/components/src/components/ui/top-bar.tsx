import * as React from "react"

import { cn } from "../../utils/cn"

function TopBar({
  bottomBorder = true,
  children,
  inset = "default",
  scrollFade = false,
  ...props
}: Omit<React.ComponentProps<"div">, "className"> & {
  bottomBorder?: boolean
  inset?: "default" | "session-panel" | "sidebar"
  scrollFade?: boolean
}) {
  const [canScrollUp, setCanScrollUp] = React.useState(false)
  const [fadeTransitionsEnabled, setFadeTransitionsEnabled] =
    React.useState(false)

  const updateScrollFade = React.useCallback(() => {
    if (!scrollFade) return
    const root = document.scrollingElement ?? document.documentElement
    const maximum = Math.max(0, root.scrollHeight - window.innerHeight)
    const position = Math.max(0, Math.min(window.scrollY, maximum))
    setCanScrollUp(position > 1 && maximum > 1)
  }, [scrollFade])

  React.useLayoutEffect(() => {
    if (!scrollFade) return
    updateScrollFade()
    const transitionFrame = window.requestAnimationFrame(() => {
      setFadeTransitionsEnabled(true)
    })
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollFade)
    observer?.observe(document.documentElement)
    if (document.body) observer?.observe(document.body)
    window.addEventListener("scroll", updateScrollFade, { passive: true })
    window.addEventListener("resize", updateScrollFade)

    return () => {
      window.cancelAnimationFrame(transitionFrame)
      observer?.disconnect()
      window.removeEventListener("scroll", updateScrollFade)
      window.removeEventListener("resize", updateScrollFade)
    }
  }, [scrollFade, updateScrollFade])

  return (
    <div
      data-slot="top-bar"
      data-bottom-border={bottomBorder}
      data-inset={inset}
      data-scroll-fade={scrollFade}
      className="relative flex h-12 shrink-0 items-center border-b border-border-solid bg-background px-4 data-[bottom-border=false]:border-b-0 data-[inset=session-panel]:h-auto data-[inset=session-panel]:bg-sidebar data-[inset=session-panel]:py-2.5 data-[inset=session-panel]:pr-[78px] data-[inset=session-panel]:pl-2.5 data-[inset=sidebar]:pr-2"
      {...props}
    >
      {children}
      {scrollFade ? (
        <div
          aria-hidden="true"
          data-slot="top-bar-scroll-fade"
          data-visible={canScrollUp}
          className={cn(
            "pointer-events-none absolute inset-x-0 top-full z-20 h-8 bg-linear-to-b from-background to-transparent opacity-0 data-[visible=true]:opacity-100",
            fadeTransitionsEnabled
              ? "transition-opacity duration-200 ease-out"
              : "transition-none"
          )}
        />
      ) : null}
    </div>
  )
}

export { TopBar }
