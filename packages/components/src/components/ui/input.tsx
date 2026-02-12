import { type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../utils/cn";
import { inputVariants } from "./input.variants";

/**
 * Input component for text entry
 */
function Input({
  className,
  type,
  size,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputVariants({ size, className }))}
      {...props}
    />
  );
}

export { Input };
