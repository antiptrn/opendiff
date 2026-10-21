import * as React from "react"

function useSidebarActiveState(active: boolean) {
  const [renderedActive, setRenderedActive] = React.useState(active)

  React.useEffect(() => {
    if (active === renderedActive) return

    const frame = window.requestAnimationFrame(() => {
      setRenderedActive(active)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [active, renderedActive])

  return renderedActive
}

export { useSidebarActiveState }
