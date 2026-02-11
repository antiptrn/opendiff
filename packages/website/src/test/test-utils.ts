import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, createElement } from "react";

/**
 * Creates a wrapper component that provides a fresh QueryClient
 * for use with renderHook from @testing-library/react.
 */
export function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}
