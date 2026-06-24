import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../utils/cn";

const textareaVariants = cva(
  "focus-visible:ring-sidebar-primary aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 rounded-none px-[13px] py-2.5 text-base transition-colors focus-visible:ring-[3px] aria-invalid:ring-[3px] placeholder:text-muted-foreground flex field-sizing-content w-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        card: "bg-card",
        background: "bg-background",
      },
      minHeight: {
        default: "min-h-16",
        md: "min-h-[120px]",
        lg: "min-h-[150px]",
      },
    },
    defaultVariants: {
      variant: "card",
      minHeight: "default",
    },
  }
);

function Textarea({
  className,
  variant,
  minHeight,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ variant, minHeight, className }))}
      {...props}
    />
  );
}

export { Textarea, textareaVariants };
