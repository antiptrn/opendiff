import { Button } from "components";
import { PageHero } from "@/components/layout/page-hero";
import { ConsoleMockup } from "./console-mockup";
// import { HeroBlinds } from "./hero-blinds";
import { HeroShader } from "./hero-shader";
import { RotatingWord } from "./rotating-word";

const HERO_WORDS = ["bugs", "regressions", "security holes", "tech debt"] as const;

export function HeroSection() {
  return (
    <div id="overview" className="relative w-full overflow-hidden">
      <HeroShader />
      {/* <HeroBlinds /> */}
      <PageHero
        className="pb-18"
        title={
          <>
            Ship pull requests faster,
            <br />
            without the{" "}
            {/* On phones the rotating word gets its own line, so the headline height never changes */}
            <br className="sm:hidden" />
            <RotatingWord words={HERO_WORDS} />
          </>
        }
      >
        <div className="flex items-center justify-center gap-2.5">
          <Button size="lg" variant="secondary" className="rounded-full">
            Sign up
          </Button>
          <Button size="lg" className="rounded-full">
            Contact sales
          </Button>
        </div>
      </PageHero>
      <div className="relative mx-auto w-full max-w-7xl px-8 pb-32">
        <div className="relative">
          <ConsoleMockup />
        </div>
      </div>
    </div>
  );
}
