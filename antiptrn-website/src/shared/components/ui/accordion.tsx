"use client";

import * as React from "react";
import { Collapsible } from "@base-ui/react";
import { ChevronDown } from "lucide-react";

import { cn } from "@shared/lib/utils";

interface AccordionItemProps {
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function AccordionItem({
  children,
  className,
  defaultOpen,
  open,
  onOpenChange,
}: AccordionItemProps) {
  return (
    <Collapsible.Root
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className={cn("border border-border rounded-xl overflow-hidden", className)}
    >
      {children}
    </Collapsible.Root>
  );
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
}

function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  return (
    <Collapsible.Trigger
      className={cn(
        "flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50 [&[data-panel-open]>svg]:rotate-180",
        className
      )}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
    </Collapsible.Trigger>
  );
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
}

function AccordionContent({ children, className }: AccordionContentProps) {
  return (
    <Collapsible.Panel
      className={cn(
        "p-4 overflow-hidden border-t border-border data-[ending-style]:animate-accordion-up data-[starting-style]:animate-accordion-down",
        className
      )}
    >
      <div>{children}</div>
    </Collapsible.Panel>
  );
}

export { AccordionItem, AccordionTrigger, AccordionContent };
