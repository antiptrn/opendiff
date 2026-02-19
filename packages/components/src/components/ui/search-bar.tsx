import { Search } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils/cn";
import { Input } from "./input";

interface SearchBarProps extends Omit<React.ComponentProps<typeof Input>, "type"> {
  containerClassName?: string;
  iconClassName?: string;
}

export function SearchBar({
  containerClassName,
  iconClassName,
  className,
  ...props
}: SearchBarProps) {
  return (
    <div className={cn("relative w-full", containerClassName)}>
      <Search
        strokeWidth={2.5}
        className={cn(
          "absolute top-1/2 left-5 size-4.5 -translate-y-1/2 text-foreground",
          iconClassName
        )}
      />
      <Input type="text" className={cn("pl-12.5", className)} {...props} />
    </div>
  );
}
