"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";

import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronDownIcon, ChevronUpIcon } from "@hugeicons/core-free-icons";
import { cn } from "../../utils";

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex w-full flex-col gap-4 overflow-hidden", className)}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border border-border data-open:border-muted rounded-lg overflow-hidden", className)}
      {...props}
    />
  );
}

/** "lg" is for marketing pages: larger text and chevron, the size of the site's header menu links */
type AccordionSize = "default" | "lg";

function AccordionTrigger({
  className,
  children,
  size = "default",
  indicator = "chevron",
  ...props
}: AccordionPrimitive.Trigger.Props & {
  size?: AccordionSize;
  /** A chevron that flips when open, or a plus whose upright bar folds away into a minus */
  indicator?: "chevron" | "plus";
}) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "hover:bg-muted data-panel-open:bg-muted focus-visible:ring-ring/50 py-3 px-4.5 focus-visible:border-ring focus-visible:after:border-ring **:data-[slot=accordion-trigger-icon]:text-muted-foreground text-left cursor-pointer focus-visible:ring-3 **:data-[slot=accordion-trigger-icon]:ml-auto group/accordion-trigger relative flex flex-1 items-center justify-between border border-transparent transition-all outline-none disabled:pointer-events-none disabled:opacity-50",
          size === "lg"
            ? "text-xl **:data-[slot=accordion-trigger-icon]:size-6"
            : "text-lg **:data-[slot=accordion-trigger-icon]:size-4.5",
          className
        )}
        {...props}
      >
        {children}
        {indicator === "plus" ? (
          <svg
            aria-hidden="true"
            data-slot="accordion-trigger-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="pointer-events-none shrink-0"
          >
            <path d="M6 12h12" />
            <path
              d="M12 6v12"
              className="origin-center transition-transform duration-200 [transform-box:fill-box] group-aria-expanded/accordion-trigger:scale-y-0"
            />
          </svg>
        ) : (
          <>
            <HugeiconsIcon icon={ChevronDownIcon}
              data-slot="accordion-trigger-icon"
              className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
            />
            <HugeiconsIcon icon={ChevronUpIcon}
              data-slot="accordion-trigger-icon"
              className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
            />
          </>
        )}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  size = "default",
  ...props
}: AccordionPrimitive.Panel.Props & { size?: AccordionSize }) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "text-muted-foreground data-open:animate-accordion-down data-closed:animate-accordion-up overflow-hidden",
        size === "lg" ? "text-lg" : "text-base"
      )}
      {...props}
    >
      <div
        className={cn(
          "text-start bg-muted pb-4 px-4.5 [&_a]:hover:text-foreground h-(--accordion-panel-height) data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
