import { Link } from "react-router-dom";
import { Icon } from "./icon";
import { Button } from "./ui";

export function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-4">
      <Link to="/">
        <Icon />
      </Link>
      <p className="text-center text-muted-foreground text-lg">This page doesn't exist.</p>
      <Button asChild className="mt-2">
        <Link to="/">Go home</Link>
      </Button>
    </div>
  );
}
