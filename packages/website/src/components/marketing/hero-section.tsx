import { SiAnthropic, SiCursor, SiGooglegemini, SiMinimax } from "@icons-pack/react-simple-icons";
import { Button, Card } from "components";
import { Link } from "react-router-dom";

export function HeroSection() {
  return (
    <div id="overview" className="overflow-hidden absolute inset-0 w-full relative">
      <div className="relative">
        <div className="relative text-start w-full flex flex-row items-end pb-16 pt-44 justify-between px-8">
          <h5 className="max-w-[659px] text-[40px] md:text-[80px] leading-[110%] lg:pb-0 md:pb-0 pb-6">
            Ship better
            <br />
            <span className="text-muted-foreground">code, faster</span>
          </h5>
          <div className="flex flex-col items-end justify-end gap-4 max-w-[409px]">
            <p className="text-right lg:text-lg md:text-lg text-base text-muted-foreground lg:mt-4 md:mt-4 mt-3 text-balance leading-7">
              Arm your team with AI-powered code reviews and catch bugs before they ship to
              production
            </p>
            <div className="flex items-start justify-start gap-4 lg:mt-4 md:mt-4 mt-4 mb-4">
              <Button size="lg" asChild>
                <Link to={import.meta.env.VITE_APP_URL || ""}>Get started now</Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <a href="cursor:extension/opendiff.opendiff-local-review">
                  <SiCursor className="size-4 shrink-0" />
                  Install for Cursor
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full flex flex-row items-center justify-center px-8 pb-32 gap-8">
        <Card className="w-full flex flex-row items-center justify-center !p-8 h-full">
          <img src="icons/openai-icon.svg" alt="OpenAI" className="size-8 shrink-0 dark:invert" />
        </Card>
        <Card className="w-full flex flex-row items-center justify-center !p-8 h-full">
          <SiAnthropic className="size-8 shrink-0" />
        </Card>
        <Card className="w-full flex flex-row items-center justify-center !p-8 h-full">
          <img
            src="icons/deepseek-icon.svg"
            alt="Deepseek"
            className="size-8 shrink-0 dark:invert"
          />
        </Card>
        <Card className="w-full flex flex-row items-center justify-center !p-8 h-full">
          <SiGooglegemini className="size-8 shrink-0" />
        </Card>
        <Card className="w-full flex flex-row items-center justify-center !p-8 h-full">
          <SiMinimax className="size-8 shrink-0" />
        </Card>
      </div>
    </div>
  );
}
