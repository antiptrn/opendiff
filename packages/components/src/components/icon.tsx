import { cn } from "../utils";

interface Props {
  className?: string;
}

export function Icon({ className }: Props) {
  return (
    <svg
      className={cn("size-6 text-foreground", className)}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 26 26"
      role="presentation"
      aria-hidden="true"
    >
      <path d="M18 4H20V6H22V18H20V20H18V22H6V20H4V18H2V6H4V4H6V2H18V4ZM7 11H9V13H7V17H13V15H16V13H18V11H16V9H13V7H7V11Z" />
    </svg>
  );
}
