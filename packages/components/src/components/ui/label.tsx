"use client";

import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../../utils/cn";

type LabelProps = React.ComponentProps<typeof LabelPrimitive.Root> & {
  size?: "sm" | "base";
  interactive?: boolean;
};

function Label({ className, size = "sm", interactive = false, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "gap-2 leading-none group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed",
        size === "base" ? "text-base" : "text-sm",
        interactive && "cursor-pointer",
        className
      )}
      {...props}
    />
  );
}

export { Label };
