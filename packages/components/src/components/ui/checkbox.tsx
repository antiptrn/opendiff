"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon, MinusSignIcon } from "@hugeicons/core-free-icons";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "../../utils/cn";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer p-0 !size-4.5 shrink-0 rounded-[4px] border data-[state=checked]:border-sidebar-primary dark:data-[state=checked]:border-sidebar-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-sidebar-primary data-[state=checked]:border-sidebar-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-sidebar-primary data-[state=indeterminate]:bg-sidebar-primary data-[state=indeterminate]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn("flex size-4.5 items-center justify-center text-current")}
      >
        {/* A tick when checked, a dash when only some are (checked="indeterminate") */}
        <HugeiconsIcon
          icon={CheckIcon}
          strokeWidth={2}
          className="size-4.5 mr-0.5 text-sidebar-primary-foreground group-data-[state=indeterminate]/checkbox:hidden"
        />
        <HugeiconsIcon
          icon={MinusSignIcon}
          strokeWidth={2}
          className="hidden size-3.5 text-sidebar-primary-foreground group-data-[state=indeterminate]/checkbox:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
