import { cn } from "components";
import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <section
      className={cn(
        "relative mx-auto max-w-7xl px-4 pb-0 sm:px-6 md:pb-16 lg:px-8 lg:pb-16",
        className
      )}
    >
      {children}
    </section>
  );
}
