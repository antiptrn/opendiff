import { cva } from "class-variance-authority";

/**
 * Variant styles for the Input component
 */
export const inputVariants = cva(
  "bg-card focus-visible:ring-sidebar-primary aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 rounded-3xl transition-colors focus-visible:ring-[3px] aria-invalid:ring-[3px] file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-12 px-4.5 text-base file:h-8 file:text-base file:font-medium",
        xs: "h-6 px-2 text-xs file:h-4 file:text-xs file:font-medium",
        sm: "h-8 px-2.5 text-base md:text-sm file:h-6 file:text-sm file:font-medium",
        lg: "h-12 px-4 text-base file:h-8 file:text-base file:font-medium",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);
