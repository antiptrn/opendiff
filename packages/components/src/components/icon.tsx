import { cn } from "../utils";

interface Props {
  className?: string;
}

export function Icon({ className }: Props) {
  return (
    <svg
      className={cn("size-5.5 text-foreground", className)}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      role="presentation"
      aria-hidden="true"
    >
      <path d="M 18 4 H 20 V 6 H 22 V 18 H 20 V 20 H 18 V 22 H 6 V 20 H 4 V 18 H 2 V 6 H 4 V 4 H 6 V 2 H 18 V 4 Z M 8 11 H 8 V 13 H 8 V 17 H 14 V 15 H 16 V 13 H 16 V 11 H 16 V 9 H 14 V 7 H 8 V 11 Z" />
    </svg>
  );
}
