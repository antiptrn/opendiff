import { Icon } from "./icon";
import { Wordmark } from "./wordmark";

export function Logo() {
  return (
    <div className="flex items-center gap-1">
      <Icon />
      <Wordmark />
    </div>
  );
}
