import { Button } from "components/components/ui/button";
import { Link } from "react-router-dom";

export function BackToBlogLink() {
  return (
    <Link to="/blog">
      <Button
        variant="ghost"
        className="-ml-4 text-muted-foreground no-underline hover:no-underline"
      >
        Back to blog
      </Button>
    </Link>
  );
}
