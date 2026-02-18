import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Separator,
} from "components";

export function FAQSection() {
  return (
    <>
      <Separator className="lg:mt-16 md:mt-16 mt-8" />
      <div
        id="faq"
        className="w-full flex lg:flex-row md:flex-col flex-col items-start justify-start lg:gap-16 md:gap-16 gap-8 px-8 lg:mt-16 md:mt-16 mt-8"
      >
        <div className="lg:w-full md:w-full w-full">
          <h1 className="lg:text-5xl md:text-5xl text-3xl leading-tight">
            Frequently Asked Questions
          </h1>
          <a href="mailto:contact@opendiff.io">
            <Button variant="secondary" className="mt-8 lg:w-auto md:w-auto w-full">
              Contact us
            </Button>
          </a>
        </div>
        <div className="w-full max-w-3xl mx-auto text-foreground items-center justify-start gap-4 overflow-hidden">
          <Accordion multiple>
            <AccordionItem>
              <AccordionTrigger>What is OpenDiff?</AccordionTrigger>
              <AccordionContent>
                OpenDiff is an open-source, AI-powered code review tool. It integrates with your
                GitHub repositories and uses OpenCode to review pull requests, catch bugs, and
                suggest improvements before code ships to production.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem>
              <AccordionTrigger>How does autonomous iteration work?</AccordionTrigger>
              <AccordionContent>
                When OpenDiff finds issues during a review, it can automatically fix them and commit
                the changes back to your pull request. You stay in control - every fix is visible in
                the PR diff for your team to approve.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem>
              <AccordionTrigger>Can I customize what OpenDiff reviews?</AccordionTrigger>
              <AccordionContent>
                Yes. You can configure agent skills, set review sensitivity, define custom rules,
                and adjust language support to match your team&apos;s standards and workflows.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem>
              <AccordionTrigger>
                I already use an AI code review tool. Can I switch?
              </AccordionTrigger>
              <AccordionContent>
                OpenDiff is designed as a drop-in replacement. Connect your repositories, configure
                your preferences, and you&apos;re up and running. No migration scripts or complex
                setup required.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem>
              <AccordionTrigger>Is OpenDiff free?</AccordionTrigger>
              <AccordionContent>
                OpenDiff is open-source under AGPL-3.0. You can self-host it on your own
                infrastructure and use your existing provider API quota, so there&apos;s no
                additional subscription cost beyond what you already pay for API usage.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem>
              <AccordionTrigger>Is OpenDiff suitable for enterprise teams?</AccordionTrigger>
              <AccordionContent>
                Yes. OpenDiff supports self-hosted deployments, custom review rules, and is built to
                work within your existing infrastructure and security requirements.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
      <Separator className="lg:mt-16 md:mt-16 mt-8" />
    </>
  );
}
