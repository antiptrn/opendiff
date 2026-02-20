import { Icon } from "./icon";
import { Badge } from "./ui";
import { Wordmark } from "./wordmark";

export function Logo() {
  return (
    <div className="flex items-center gap-1.5">
      <Icon />
      <Wordmark />
      <Badge variant="secondary" className="h-5 px-1">v0.1</Badge>
    </div>
  );
}
