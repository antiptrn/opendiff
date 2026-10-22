import { Button } from "components";

/** The lander's two calls to action, shared by the hero and the closing call to action */
export function HeroActions() {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <Button size="lg" variant="secondary">
        Sign up
      </Button>
      <Button size="lg">Contact sales</Button>
    </div>
  );
}
