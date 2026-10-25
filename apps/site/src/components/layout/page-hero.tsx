import { cn } from "components";
import type { ReactNode } from "react";

interface PageHeroProps {
  /**
   * Shown above the title. Text gets the muted label style; pass a component (such as a badge or a
   * link) to render it as-is.
   */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shown below the title and subtitle, such as call-to-action buttons */
  children?: ReactNode;
  className?: string;
  /** The title's heading level: h1 for the top of a page, h2 for a repeat lower down */
  titleAs?: "h1" | "h2";
  /**
   * "centered" stacks everything in the middle. "split" puts a large title on the left and the
   * subtitle and buttons on the right, lined up with the bottom of the title; with no subtitle,
   * the buttons sit under the title instead.
   */
  layout?: "centered" | "split";
  /** Extra classes for the title, such as a font size that fits its longest line to the column */
  titleClassName?: string;
}

/** Page title block shared by the lander and the marketing pages, so titles sit alike */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
  className,
  titleAs: Title = "h1",
  layout = "centered",
  titleClassName,
}: PageHeroProps) {
  if (layout === "split") {
    return (
      <div
        className={cn(
          "relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-8 pt-48",
          subtitle && "lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16",
          className
        )}
      >
        {/* A size container, so a title can scale with the width it gets */}
        <div className="@container min-w-0">
          {typeof eyebrow === "string" || typeof eyebrow === "number" ? (
            <p className="mb-6 text-muted-foreground">{eyebrow}</p>
          ) : eyebrow ? (
            <div className="mb-6">{eyebrow}</div>
          ) : null}
          {/* Line height goes last: tailwind-merge drops a leading-* that comes before a text size */}
          <Title className={cn("text-4xl tracking-tight md:text-6xl", titleClassName, "leading-[1.05]")}>
            {title}
          </Title>
          {/* Without a subtitle there's no right column: the buttons sit under the title */}
          {!subtitle && children ? <div className="mt-8">{children}</div> : null}
        </div>
        {subtitle ? (
          <div className="lg:justify-self-end lg:pb-2">
            <p className="max-w-md text-base text-foreground md:text-lg">{subtitle}</p>
            {children ? <div className="mt-8">{children}</div> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center justify-center px-8 pt-48 text-center",
        className
      )}
    >
      {typeof eyebrow === "string" || typeof eyebrow === "number" ? (
        <p className="text-muted-foreground mb-4">{eyebrow}</p>
      ) : eyebrow ? (
        <div className="mb-4">{eyebrow}</div>
      ) : null}
      <Title className={cn("max-w-[800px] text-4xl lg:leading-16 md:leading-16 sm:leading-8 xs:leading-8 tracking-tight md:text-6xl", eyebrow ? "mt-6" : "mt-0")}>{title}</Title>
      {subtitle ? (
        <p className="mt-4 max-w-[609px] text-balance text-lg text-muted-foreground md:text-xl">
          {subtitle}
        </p>
      ) : null}
      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  );
}
