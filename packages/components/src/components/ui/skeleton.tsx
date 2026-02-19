import { cn } from "../../utils/cn";

function Skeleton({
  className,
  muted,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { muted?: boolean }) {
  return (
    <div
      className={cn(
        "animate-shimmer !rounded-none bg-[length:200%_100%]",
        muted
          ? "bg-[linear-gradient(90deg,var(--color-background)_0%,var(--color-muted)_50%,var(--color-background)_100%)] dark:bg-[linear-gradient(90deg,var(--color-secondary)_0%,var(--color-muted)_50%,var(--color-secondary)_100%)]"
          : "bg-[linear-gradient(90deg,var(--color-input)_0%,var(--color-muted)_50%,var(--color-input)_100%)] dark:bg-[linear-gradient(90deg,var(--color-card)_0%,var(--color-muted)_50%,var(--color-card)_100%)]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
