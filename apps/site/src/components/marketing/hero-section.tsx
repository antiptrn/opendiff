import { PageHero } from "@/components/layout/page-hero";
import { ConsoleMockup } from "./console-mockup";
import { HeroActions } from "./hero-actions";
import { RotatingWord } from "./rotating-word";
import { Badge } from "components";
import { HeroShader } from "./hero-shader";

const HERO_WORDS = ["bugs", "regressions", "security holes", "tech debt"] as const;

export function HeroSection() {
  return (
    <div id="overview" className="relative w-full overflow-hidden">
      {<HeroShader />}
      <PageHero
        layout="split"
        className="pb-18"
        // "without the security holes", the longest line, is about 10.3em wide: scale the title so it
        // always fits on one line, up to the usual 60px
        titleClassName="text-[length:min(3.75rem,calc(100cqi/10.8))] md:text-[length:min(3.75rem,calc(100cqi/10.8))]"
        title={
          <>
            Ship new features faster,
            <br />
            {/* Kept on one line, with the rotating word, at every width */}
            <span className="whitespace-nowrap">
              without the <RotatingWord words={HERO_WORDS} />
            </span>
          </>
        }
      >
        <HeroActions align="start" />
      </PageHero>
      <div className="relative mx-auto w-full max-w-7xl px-8 pb-32">
        <div className="relative">
          <ConsoleMockup />
        </div>
      </div>
    </div>
  );
}
