import { cn } from "components";
import type { ReactNode } from "react";

interface ResourceContainerProps {
  children: ReactNode;
  className?: string;
}

export function ResourceContainer({ children, className }: ResourceContainerProps) {
  return (
    <section
      className={cn(
        "mx-auto flex max-w-6xl flex-col items-start justify-start px-4 pb-0 md:px-8 md:pb-16 lg:px-8 lg:pb-16 lg:pt-40 md:pt-40 pt-20",
        className
      )}
    >
      {children}
    </section>
  );
}
