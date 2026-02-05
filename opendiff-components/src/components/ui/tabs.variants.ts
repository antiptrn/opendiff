import { cva } from "class-variance-authority";

/**
 * Variant styles for the TabsList component
 */
export const tabsListVariants = cva(
  "shadow-md dark:shadow-none rounded-3xl h-12 p-1 data-[variant=line]:rounded-none group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-card",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);
