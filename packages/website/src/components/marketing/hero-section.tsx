import { SiGithub } from "@icons-pack/react-simple-icons";
import { Button } from "components";
import { Link } from "react-router-dom";

export function HeroSection() {
  return (
    <div className="overflow-hidden w-full relative">
      {/*
        <div
        aria-hidden="true"
        className="absolute inset-0 not-dark:opacity-50 [background-image:repeating-linear-gradient(to_right,transparent,var(--muted)_calc(100%/8))] md:[background-image:repeating-linear-gradient(to_right,transparent,var(--muted)_calc(100%/14))] lg:[background-image:repeating-linear-gradient(to_right,transparent,var(--muted)_calc(100%/16))]"
      />
        */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--background)_0%,var(--background)15%,transparent_45%)] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_100%_90%_at_50%_50%,var(--background)10%,transparent_30%)] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_10%,var(--background)_70%)] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,var(--background)_0%,transparent_10%,transparent_90%,var(--background)_100%)] pointer-events-none"
      />
      <div className="relative">
        <div className="relative text-center w-full flex flex-col items-center justify-start px-8 lg:pt-40 md:pt-40 pt-32">
          <Button
            variant="secondary"
            className="lg:mb-6 md:mb-6 mb-4 text-sm font-normal rounded-lg h-auto py-2 px-3.5 gap-2.5"
            asChild
          >
            <a
              href="https://github.com/antiptrn/opendiff"
              target="_blank"
              rel="noopener noreferrer"
            >
              <SiGithub className="size-3.5 shrink-0" />
              Star OpenDiff on GitHub
            </a>
          </Button>
          <h5 className="font-normal max-w-[609px] text-[40px] md:text-[58px] leading-tight pb-1">
            Stop shipping slop—keep shipping fast
          </h5>
          <p className="lg:text-xl md:text-xl text-base text-muted-foreground max-w-[609px] mx-auto lg:mt-4 md:mt-4 mt-3 text-balance leading-7">
            Arm your team with AI-powered code reviews to catch bugs before they ship to production.
          </p>
          <div className="flex items-center justify-center gap-4 lg:mt-9 md:mt-9 mt-7">
            <Button asChild>
              <Link to={import.meta.env.VITE_APP_URL || ""}>Get started now</Link>
            </Button>
            <Button variant="secondary">Why OpenDiff?</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
