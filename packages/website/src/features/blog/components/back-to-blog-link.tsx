import { Button } from "components/components/ui/button";
import { Link } from "react-router-dom";

export function BackToBlogLink() {
  return (
    <Button
      variant="secondary"
      asChild
    >
      <Link to="/blog">
        Back to blog
      </Link>
    </Button>
  );
}
