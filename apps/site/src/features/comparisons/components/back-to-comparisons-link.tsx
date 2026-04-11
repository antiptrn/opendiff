import { Button } from "components/components/ui/button";
import { Link } from "react-router-dom";

export function BackToComparisonsLink() {
  return (
    <Button variant="secondary" asChild>
      <Link to="/comparisons">Back to comparisons</Link>
    </Button>
  );
}
