import { useRef, useState } from "react";
import type { HoverStyle } from "./header.types";

/**
 * Hook for managing animated hover indicator in navigation.
 * Tracks mouse position relative to nav container and provides
 * smooth transitions between nav items.
 */
export function useNavHover() {
  const [hoverStyle, setHoverStyle] = useState<HoverStyle>({ left: 0, width: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  /** Updates hover indicator position based on hovered element */
  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!navRef.current) return;
    const navRect = navRef.current.getBoundingClientRect();
    const targetRect = e.currentTarget.getBoundingClientRect();
    setHoverStyle({
      left: targetRect.left - navRect.left,
      width: targetRect.width,
    });
    setIsHovering(true);
  };

  /** Hides hover indicator when mouse leaves nav */
  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  return {
    navRef,
    hoverStyle,
    isHovering,
    handleMouseEnter,
    handleMouseLeave,
  };
}
