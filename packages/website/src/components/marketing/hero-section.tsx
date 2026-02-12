import { SiGithub } from "@icons-pack/react-simple-icons";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Separator,
} from "components";
import { Book, Building, Languages, MessageCircle, Scale, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { AutonomousIterationItems } from "./autonomous-iteration-items";
import FeatureCard from "./feature-card";

export function HeroSection() {
  return (
    <>
      <section className="p-0 flex w-full items-start justify-center">
        <div className="w-full mx-auto max-w-6xl text-start flex flex-col items-start justify-center">
          <div className="overflow-hidden w-full relative">
            {/* Blinds */}
            <div
              aria-hidden="true"
              className="absolute inset-0 not-dark:opacity-50 [background-image:repeating-linear-gradient(to_right,transparent,var(--muted)_calc(100%/8))] md:[background-image:repeating-linear-gradient(to_right,transparent,var(--muted)_calc(100%/14))] lg:[background-image:repeating-linear-gradient(to_right,transparent,var(--muted)_calc(100%/16))]"
            />
            {/* Top fade covering header */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--background)_0%,var(--background)15%,transparent_45%)] pointer-events-none"
            />
            {/* U-shaped fade overlay */}
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
                >
                  <SiGithub className="size-3.5 shrink-0" />
                  Star OpenDiff on GitHub
                </Button>
                <h5 className="tracking-tighter font-normal max-w-[519px] text-[40px] md:text-[58px] leading-tight pb-1">
                  Stop shipping slop
                </h5>
                <p className="lg:text-xl md:text-xl text-base text-muted-foreground max-w-[609px] mx-auto lg:mt-4 md:mt-4 mt-2.5 text-balance leading-7">
                  Arm your team with AI-powered code reviews to catch bugs before they ship to
                  production.
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
          <Separator className="lg:mt-40 md:mt-40 mt-32" />
          <div className="w-full px-8 lg:mt-16 md:mt-16 mt-8">
            <Badge variant="outline">Getting started</Badge>
            <h1 className="lg:text-4xl md:text-4xl text-3xl mt-6 leading-tight">
              Easy to install, easier to use
            </h1>
            <p className="text-muted-foreground lg:text-lg md:text-lg text-base mt-4 max-w-3xl">
              OpenDiff can be installed in any repository with 2 clicks.
            </p>
          </div>
          <div className="flex lg:flex-row md:flex-row flex-col items-center justify-center gap-8 w-full lg:mt-16 md:mt-16 mt-8 px-8">
            <FeatureCard
              className="lg:h-100 md:h-100 h-80 pb-0"
              title="Autonomous iteration"
              description="OpenDiff reviews your code, but can also automatically fix issues and commit changes back."
            >
              <AutonomousIterationItems />
            </FeatureCard>
            <FeatureCard
              grid
              title="Flexible and customizable"
              description="Powered by Claude, our industry-leading coding agent catches bugs before they ship to production."
            >
              <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted rounded-md">
                <Book className="size-3.5 shrink-0" />
                <p className="text-sm truncate">Agent skills</p>
              </div>
              <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted rounded-md">
                <SlidersHorizontal className="size-3.5 shrink-0" />
                <p className="text-sm truncate">Review sensitivity</p>
              </div>
              <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted rounded-md">
                <Scale className="size-3.5 shrink-0" />
                <p className="text-sm truncate">Custom rules</p>
              </div>
              <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted rounded-md">
                <Languages className="size-3.5 shrink-0" />
                <p className="text-sm truncate">Language support</p>
              </div>
              <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted rounded-md">
                <MessageCircle className="size-3.5 shrink-0" />
                <p className="text-sm truncate">Two-way communication</p>
              </div>
              <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted rounded-md">
                <Building className="size-3.5 shrink-0" />
                <p className="text-sm truncate">Enterprise-ready</p>
              </div>
            </FeatureCard>
          </div>
          <Separator className="lg:mt-16 md:mt-16 mt-8" />
          <div className="w-full flex lg:flex-row md:flex-col flex-col items-start justify-start lg:gap-16 md:gap-16 gap-8 px-8 lg:mt-16 md:mt-16 mt-8">
            <div className="lg:w-full md:w-full w-full">
              <Badge variant="outline">Open-source under AGPL-3.0</Badge>
              <h1 className="lg:text-4xl md:text-4xl text-3xl mt-6 leading-tight">
                Deploy on your own infrastructure
              </h1>
              <p className="max-w-3xl text-muted-foreground lg:text-lg md:text-lg text-base mt-4">
                AI gets expensive fast. OpenDiff can be used with Anthropic's existing billing
                quotas so you don't have to pay for API usage.
              </p>
              <Button
                variant="secondary"
                className="lg:mt-16 md:mt-16 mt-8 lg:w-auto md:w-auto w-full"
              >
                Clone OpenDiff on GitHub
              </Button>
            </div>
          </div>
          <Separator className="lg:mt-16 md:mt-16 mt-8" />
          <div className="w-full flex lg:flex-row md:flex-col flex-col items-start justify-start lg:gap-16 md:gap-16 gap-8 px-8 lg:mt-16 md:mt-16 mt-8">
            <div className="lg:w-full md:w-full w-full bg-card rounded-xl lg:p-16 md:p-16 p-8 gap-0">
              <h1 className="lg:text-4xl md:text-4xl text-3xl lg:leading-12 md:leading-12 leading-10">
                Your team moves fast with AI. But fast shouldn’t mean sloppy. OpenDiff makes sure every line still earns its merge.
              </h1>
              <Button className="lg:mt-13 md:mt-13 mt-6 lg:w-auto md:w-auto w-full">Get started now</Button>
            </div>
          </div>
          <Separator className="lg:mt-16 md:mt-16 mt-8" />
          <div className="w-full flex lg:flex-row md:flex-col flex-col items-start justify-start lg:gap-16 md:gap-16 gap-8 px-8 lg:mt-16 md:mt-16 mt-8">
            <div className="lg:w-full md:w-full w-full">
              <h1 className="lg:text-4xl md:text-4xl text-3xl leading-tight">
                Frequently Asked Questions
              </h1>
              <p className="max-w-3xl text-muted-foreground lg:text-lg md:text-lg text-base mt-4">
                We've answered some of the most common questions about OpenDiff. If you have any
                other questions, please don't hesitate to contact us.
              </p>
              <Button
                variant="secondary"
                className="lg:mt-16 md:mt-16 mt-8 lg:w-auto md:w-auto w-full"
              >
                Contact us
              </Button>
            </div>
            <div className="w-full max-w-3xl mx-auto text-foreground items-center justify-start gap-4 overflow-hidden">
              <Accordion multiple>
                <AccordionItem>
                  <AccordionTrigger>What is OpenDiff?</AccordionTrigger>
                  <AccordionContent>
                    OpenDiff is an open-source, AI-powered code review tool. It integrates with your
                    GitHub repositories and uses Claude to review pull requests, catch bugs, and
                    suggest improvements before code ships to production.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>How does autonomous iteration work?</AccordionTrigger>
                  <AccordionContent>
                    When OpenDiff finds issues during a review, it can automatically fix them and
                    commit the changes back to your pull request. You stay in control — every fix is
                    visible in the PR diff for your team to approve.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>Can I customize what OpenDiff reviews?</AccordionTrigger>
                  <AccordionContent>
                    Yes. You can configure agent skills, set review sensitivity, define custom
                    rules, and adjust language support to match your team's standards and workflows.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>
                    I already use an AI code review tool. Can I switch?
                  </AccordionTrigger>
                  <AccordionContent>
                    OpenDiff is designed as a drop-in replacement. Connect your repositories,
                    configure your preferences, and you're up and running. No migration scripts or
                    complex setup required.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>Is OpenDiff free?</AccordionTrigger>
                  <AccordionContent>
                    OpenDiff is open-source under AGPL-3.0. You can self-host it on your own
                    infrastructure and use your existing Anthropic API quota, so there's no
                    additional subscription cost beyond what you already pay for API usage.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>Is OpenDiff suitable for enterprise teams?</AccordionTrigger>
                  <AccordionContent>
                    Yes. OpenDiff supports self-hosted deployments, custom review rules, and is
                    built to work within your existing infrastructure and security requirements.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
          <Separator className="lg:mt-16 md:mt-16 mt-8" />
        </div>
      </section>
    </>
  );
}
