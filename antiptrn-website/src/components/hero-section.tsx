import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="lg:pt-40 md:pt-40 pt-30 pb-20 px-4 sm:px-6 lg:px-8 container mx-auto flex w-full items-start justify-center">
      <div className="w-full text-start flex flex-col items-start justify-center">

        <div className="w-full flex lg:flex-row md:flex-row flex-col justify-between gap-7">
          <div className="lg:text-left md:text-left text-center flex flex-col lg:items-start md:items-start items-center">
            <h1
              className="font-interphases lg:text-4xl md:text-4xl text-3xl tracking-tight mb-3"
            >
              Building the future of work.

            </h1>

            <p className="text-muted-foreground max-w-2xl">
              Modern workflows for modern teams.
            </p>
          </div>

          <div className="flex flex-col lg:items-end md:items-end items-center gap-3 justify-center">
            <Button className="w-fit" size="lg" asChild>
              <a href="#contact">
                Try antiptrn
              </a>
            </Button>
            <p className="text-muted-foreground text-xs">
              14-day free trial - cancel anytime.
            </p>
          </div>
        </div>


        <div className="mt-12 lg:mb-4 3xl:mb-20 overflow-visible lg:w-full">
          <div className="relative overflow-hidden rounded-lg">
            <img src="/halftone.webp" alt="Hero Section" className="w-full h-full object-cover" />
          </div>
        </div>

      </div>
    </section>
  );
}
