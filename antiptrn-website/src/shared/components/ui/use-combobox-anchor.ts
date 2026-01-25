import * as React from "react";

/**
 * Hook for creating a ref to use as a combobox anchor element
 */
export function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}
