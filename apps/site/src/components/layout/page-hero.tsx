import { cn } from "components";
import type { ReactNode } from "react";

interface PageHeroProps {
  /** Small uppercase label above the title */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shown below the title and subtitle, such as call-to-action buttons */
  children?: ReactNode;
  className?: string;
  /** The title's heading level: h1 for the top of a page, h2 for a repeat lower down */
  titleAs?: "h1" | "h2";
}

/** Centered page title block shared by the lander and the marketing pages, so titles sit alike */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
  className,
  titleAs: Title = "h1",
}: PageHeroProps) {
  return (
    <div
      className={cn(
        "relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center justify-center px-8 pt-40 text-center",
        className
      )}
    >
      {eyebrow ? (
        <p className="text-muted-foreground mb-6">{eyebrow}</p>
      ) : null}
      <Title className={cn("max-w-[800px] text-4xl leading-16 tracking-tight md:text-6xl", eyebrow ? "mt-8" : "mt-0")}>{title}</Title>
      {subtitle ? (
        <p className="mt-4 max-w-[609px] text-balance text-lg text-muted-foreground md:text-xl">
          {subtitle}
        </p>
      ) : null}
      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  );
}
