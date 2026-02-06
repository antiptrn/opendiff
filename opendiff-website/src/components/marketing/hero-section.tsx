import { Button } from "opendiff-components";
import { Link } from "react-router-dom";

export function HeroSection() {
  return (
    <>
      <section className="p-4 flex w-full items-start justify-center">
        <div className="w-full mx-auto max-w-5xl text-start flex flex-col items-start justify-center">
          <div className="overflow-visible w-full">
            <div className="relative overflow-hidden">
              <div className="relative text-center w-full flex flex-col items-center justify-start px-8 lg:py-40 md:py-40 py-32">
                <h5 className="lg:text-6xl md:text-6xl text-4xl text-balance lg:leading-16 md:leading-16 leading-10">Catch bugs before they ship</h5>
                <p className="lg:text-xl md:text-xl text-base text-muted-foreground max-w-2xl mx-auto lg:mt-8 md:mt-8 mt-5 text-balance leading-7">Cut review time by 50% with AI-powered code reviews. Open-source.</p>
                <Button className="lg:mt-8 md:mt-8 mt-5" asChild>
                  <Link to={import.meta.env.VITE_APP_URL || ""}>Get Started For Free</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
