import { Button, Separator } from "components";
import { Link } from "react-router-dom";

export function LanderCtaSection() {
  return (
    <>
      <Separator className="lg:mt-16 md:mt-16 mt-8" />
      <div className="w-full flex lg:flex-row md:flex-col flex-col items-start justify-start lg:gap-16 md:gap-16 gap-8 px-8 lg:mt-16 md:mt-16 mt-8">
        <div className="lg:w-full md:w-full w-full border rounded-xl lg:p-16 md:p-16 p-8 gap-0">
          <h1 className="lg:text-4xl md:text-4xl text-3xl lg:leading-12 md:leading-12 leading-10">
            Stop shipping slop. Keep shipping fast.
          </h1>
          <p className="text-muted-foreground lg:text-lg md:text-lg text-base mt-4">
            Your team moves fast with AI. But fast shouldn&apos;t mean sloppy. OpenDiff makes sure
            every line still earns its merge.
          </p>
          <Button asChild className="lg:mt-16 md:mt-16 mt-8 lg:w-auto md:w-auto w-full">
            <Link to={import.meta.env.VITE_APP_URL || ""}>Get started now</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
