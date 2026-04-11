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
        "relative mx-auto max-w-6xl px-4 pt-32 pb-0 sm:px-6 md:pt-40 md:pb-16 lg:px-8 lg:pt-40 lg:pb-16",
        className
      )}
    >
      {children}
    </section>
  );
}
