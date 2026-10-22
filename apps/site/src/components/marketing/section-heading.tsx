import type { ReactNode } from "react";
import { CornerPlus } from "./corner-plus";

/**
 * Heading above a landing page section: its number and name on the left; on the right a two-part
 * headline (the second part muted) and a line of description below it. A rule runs along the
 * top, with plus marks at its start and where the columns split, and a line runs down between the
 * columns, like the FAQ's frame.
 */
export function SectionHeading({
  index,
  label,
  title,
  subtitle,
  description,
}: {
  /** The section's place on the page, shown as "01", "02", … */
  index: number;
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="relative grid gap-6 border-t border-border-solid lg:grid-cols-2 lg:gap-0">
      <CornerPlus className="-top-1.5 -left-1.5" />
      <CornerPlus className="-top-1.5 left-1/2 hidden -translate-x-1/2 lg:block" />
      <p className="flex gap-4 pt-12 text-4xl md:text-5xl lg:pr-12">
        <span className="text-yellow">{String(index).padStart(2, "0")}</span>
        <span>{label}</span>
      </p>
      <div className="border-border-solid pb-12 lg:border-l lg:pt-12 lg:pl-12">
        <h2 className="text-3xl md:text-4xl">
          {title}
          {subtitle && (
            <>
              <br />
              <span className="text-muted-foreground">{subtitle}</span>
            </>
          )}
        </h2>
        {description && (
          <p className="mt-12 max-w-xl text-lg text-foreground md:mt-20">{description}</p>
        )}
      </div>
    </div>
  );
}
