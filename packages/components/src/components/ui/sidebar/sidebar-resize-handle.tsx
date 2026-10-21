import { useSidebar } from "./shared"

import { PanelResizeHandle } from "./panel-resize-handle"

function SidebarResizeHandle({ side }: { side: "left" | "right" }) {
  const { isResizing, startResize } = useSidebar()

  return (
    <PanelResizeHandle
      ariaLabel="Resize sidebar"
      isResizing={isResizing}
      position="viewport"
      side={side}
      onPointerDown={(event) => startResize(event, side)}
    />
  )
}

export { SidebarResizeHandle }
