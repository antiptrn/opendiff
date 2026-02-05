import type { HoverStyle } from "./header.types";

interface NavHoverIndicatorProps {
  hoverStyle: HoverStyle;
  isVisible: boolean;
}

/** Animated background pill that follows hovered nav items */
export function NavHoverIndicator({ hoverStyle, isVisible }: NavHoverIndicatorProps) {
  return (
    <div
      className={`absolute h-8 bg-muted rounded-full transition-all duration-200 ease-out pointer-events-none -z-10 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        left: hoverStyle.left,
        width: hoverStyle.width,
      }}
    />
  );
}
