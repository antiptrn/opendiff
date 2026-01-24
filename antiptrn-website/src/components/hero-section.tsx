import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function HeroSection() {
  return (
    <section className="lg:pt-40 md:pt-40 pt-30 pb-20 px-4 sm:px-6 lg:px-8 container mx-auto flex w-full items-start justify-center">
      <div className="w-full text-start flex flex-col items-center justify-center">
        <div className="flex flex-col text-center items-center justify-center">
          <h1 className="text-7xl mb-7">Ship more, faster</h1>
          <p className="text-lg text-muted-foreground">Our services page content goes here.</p>
          <div className="flex items-center justify-center gap-4 mt-11">
            <Button className="w-fit rounded-full" size="lg" asChild>
              <Link to="/pricing">Get started</Link>
            </Button>

            <Button className="w-fit rounded-full" variant="secondary" size="lg" asChild>
              <Link to="/services">Why antiptrn</Link>
            </Button>
          </div>
        </div>

        <div className="mt-24 overflow-visible w-full">
          <div className="relative overflow-hidden rounded-lg">
            <div className="w-full h-128 bg-card" />
          </div>
        </div>
      </div>
    </section>
  );
}
