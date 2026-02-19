import { Badge, Button } from "components";

export function OpenSourceSection() {
  return (
    <>
      <div className="w-full flex lg:flex-row md:flex-col flex-col items-start justify-start lg:gap-16 md:gap-16 gap-8 px-8 lg:mt-32 md:mt-32 mt-16">
        <div className="lg:w-full md:w-full w-full">
          <Badge className="text-base h-8 px-3.5" variant="secondary">OSS under AGPL-3.0</Badge>
          <h1 className="lg:text-5xl md:text-5xl text-3xl mt-6 leading-tight">
            Deploy on your own infrastructure
          </h1>
          <p className="max-w-3xl text-muted-foreground lg:text-lg md:text-lg text-base mt-4">
            AI gets expensive fast. OpenDiff can be used with existing billing
            quotas so you don&apos;t have to pay for API usage.
          </p>
          <Button
            variant="secondary"
            className="lg:mt-16 md:mt-16 mt-8 lg:w-auto md:w-auto w-full"
            asChild
          >
            <a
              href="https://github.com/antiptrn/opendiff"
              target="_blank"
              rel="noopener noreferrer"
            >
              Clone OpenDiff on GitHub
            </a>
          </Button>
        </div>
      </div>
    </>
  );
}
