import { Button, cn } from "components";

const APP_URL = import.meta.env.VITE_APP_URL || "";

/** The lander's two calls to action. `align` lines them up with a centred or left-aligned title. */
export function HeroActions({ align = "center" }: { align?: "center" | "start" }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2.5",
        align === "center" ? "mt-2 justify-center" : "justify-start"
      )}
    >
      <Button variant="secondary" asChild size="lg">
        <a href={`${APP_URL}/login`}>
          Sign up
        </a>
      </Button>
      <Button asChild size="lg">
        <a href={`${APP_URL}/login`}>
          Contact sales
        </a>
      </Button>
    </div>
  );
}
