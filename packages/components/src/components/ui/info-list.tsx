import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Separator } from "./separator";

interface InfoListProps {
  children: ReactNode;
  className?: string;
}

/**
 * Container for a list of label-value pairs with separators
 */
export function InfoList({ children, className }: InfoListProps) {
  return <dl className={cn("text-sm", className)}>{children}</dl>;
}

interface InfoItemProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  /** Whether to show separator after this item (default: true) */
  separator?: boolean;
}

/**
 * A single label-value pair in an InfoList
 */
export function InfoItem({ label, children, className, separator = true }: InfoItemProps) {
  return (
    <>
      <div className={cn("flex justify-between items-center", className)}>
        <dt className="text-muted-foreground text-base">{label}</dt>
        <dd>{children}</dd>
      </div>
      {separator && <Separator className="my-4" />}
    </>
  );
}
