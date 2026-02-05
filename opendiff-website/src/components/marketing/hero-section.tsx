import heroBackground from "opendiff-assets/public/hero-background.webp";
import { Button } from "opendiff-components";

export function HeroSection() {
  return (
    <>
      <link rel="preload" as="image" href={heroBackground} type="image/webp" />
      <section className="p-4 flex w-full items-start justify-center">
        <div className="w-full text-start flex flex-col items-center justify-center">
          <div className="overflow-visible w-full">
            <div className="relative overflow-hidden rounded-3xl bg-radial-[ellipse_60vw_200px_at_50%_0%] from-card to-transparent">
              <div className="mask-radial-from-45% mask-radial-to-75% mask-radial-at-top mask-radial-[75%_100%] md:aspect-9/4 absolute inset-0 aspect-square opacity-65 dark:opacity-15">
                <img
                  alt="hero background"
                  loading="eager"
                  fetchPriority="high"
                  width={2102}
                  height={1694}
                  decoding="async"
                  className="h-full w-full object-cover object-top"
                  style={{ color: "transparent" }}
                  src={heroBackground}
                />
              </div>
              <div className="relative text-center w-full h-128 flex flex-col items-center justify-start px-8 lg:pt-40 md:pt-40 pt-32">
                <h5 className="lg:text-4xl md:text-4xl text-3xl text-balance">Open-source AI for Code Review</h5>
                <p className="lg:text-lg md:text-lg text-base text-muted-foreground max-w-2xl mx-auto lg:mt-5 md:mt-5 mt-4">Catch bugs before they ship with OpenDiff.</p>
                <Button className="lg:mt-9 md:mt-9 mt-8">Get Started</Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
