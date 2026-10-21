import { motion, type HTMLMotionProps, useReducedMotion } from "framer-motion"
import { cn } from "../../../utils/cn"

import { TRAFFIC_BUTTONS_SAFE_AREA, useSidebar } from "./shared"

function SidebarInset({ className, ...props }: HTMLMotionProps<"main">) {
  const { isResizing, state } = useSidebar()
  const reduceMotion = useReducedMotion()

  return (
    <motion.main
      data-slot="sidebar-inset"
      initial={false}
      animate={{
        "--traffic-buttons-safe-area":
          state === "collapsed" ? `${TRAFFIC_BUTTONS_SAFE_AREA}px` : "16px",
      }}
      transition={{
        duration: isResizing || reduceMotion ? 0 : 0.2,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "relative flex w-full min-w-0 flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      data-sidebar-state={state}
      {...props}
    />
  )
}

export { SidebarInset }
