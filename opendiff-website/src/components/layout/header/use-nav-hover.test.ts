import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useNavHover } from "./use-nav-hover";

describe("useNavHover", () => {
  it("initializes with default values", () => {
    const { result } = renderHook(() => useNavHover());

    expect(result.current.hoverStyle).toEqual({ left: 0, width: 0 });
    expect(result.current.isHovering).toBe(false);
    expect(result.current.navRef.current).toBeNull();
  });

  it("sets isHovering to false on mouse leave", () => {
    const { result } = renderHook(() => useNavHover());

    act(() => {
      result.current.handleMouseLeave();
    });

    expect(result.current.isHovering).toBe(false);
  });

  it("provides handleMouseEnter and handleMouseLeave functions", () => {
    const { result } = renderHook(() => useNavHover());

    expect(typeof result.current.handleMouseEnter).toBe("function");
    expect(typeof result.current.handleMouseLeave).toBe("function");
  });
});
