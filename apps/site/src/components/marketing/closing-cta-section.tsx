import { PageHero } from "@/components/layout/page-hero";
import { HeroActions } from "./hero-actions";

/** Last section of the lander: a headline and the same two buttons as the hero, styled alike */
export function ClosingCtaSection() {
  return (
    <section id="get-started" className="w-full pb-40">
      <PageHero
        titleAs="h2"
        className="pt-0"
        title={
          <>
            Give every pull request
            <br />
            a second pair of eyes
          </>
        }
      >
        <HeroActions />
      </PageHero>
    </section>
  );
}
