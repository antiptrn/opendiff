import { cn } from "../../utils/cn";

function Skeleton({
  className,
  muted,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { muted?: boolean }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md",
        muted ? "bg-background dark:bg-muted" : "bg-input dark:bg-card",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
