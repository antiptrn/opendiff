import { cn } from "../../utils/cn";
import { Badge } from "./badge";

export default function NumberBadge({
  number,
  size = "default",
}: { number: number; size?: "default" | "sm" }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-normal text-base min-w-5.5 rounded-sm",
        size === "sm" && "px-1 text-xs min-w-4.5 h-4.5"
      )}
    >
      {number}
    </Badge>
  );
}
