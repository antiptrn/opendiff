import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "../../utils/cn";

/**
 * A scrolling region with our own thin, rounded scrollbars in place of the browser's. Each bar is
 * a slim track (the wrapper) holding a pill thumb, and only appears when the content overflows.
 */
function ScrollArea({
  className,
  children,
  orientation = "both",
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  /** Which scrollbars to show */
  orientation?: "vertical" | "horizontal" | "both";
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("group/scroll-area relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          // Room under the content for the horizontal bar, so it never sits on top of the last row
          orientation !== "vertical" && "group-data-has-overflow-x/scroll-area:pb-2.5"
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar orientation="vertical" />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        // The track: a slim rounded strip inset from the edges, faintly tinted so the bar reads as a unit
        "m-1 flex touch-none rounded-full bg-muted p-px select-none",
        "data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:flex-col",
        "data-[orientation=vertical]:w-1.5",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-muted-foreground/40 transition-colors hover:bg-muted-foreground/70"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
