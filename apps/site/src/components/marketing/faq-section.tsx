import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button } from "components";
import { CornerPlus } from "./corner-plus";

const FAQS = [
  {
    question: "What exactly is Contrast?",
    answer:
      "An AI code reviewer for GitHub. It reviews every pull request, reading the whole diff and the code around it, and leaves its findings on the pull request like a teammate would.",
  },
  {
    question: "What does it look for?",
    answer:
      "Bugs, security vulnerabilities, performance problems and anti-patterns: the things a careful reviewer catches before they reach your main branch.",
  },
  {
    question: "Can it fix what it finds?",
    answer:
      "Yes. Contrast can commit fixes for its findings straight to the pull request's branch, so you review a change instead of writing one.",
  },
  {
    question: "Which code hosts does it work with?",
    answer:
      "GitHub. You install the Contrast GitHub App on the repositories you choose, and reviews start on their next pull request.",
  },
  {
    question: "Can we teach it our conventions?",
    answer:
      "Yes. Write skills with your own review instructions and set rules for each repository, and Contrast follows them on every review.",
  },
  {
    question: "Will it change how our team works?",
    answer:
      "No. Reviews show up on your pull requests in GitHub, next to your team's own, so nobody has to learn a new tool.",
  },
  {
    question: "Is Contrast open source?",
    answer:
      "Yes. The code is on GitHub, so you can read exactly what it does with your code, or run it yourself.",
  },
];

/**
 * Frequently asked questions in a frame of lines: rules across the top and bottom, a divider
 * between the pitch on the left and the questions on the right, and plus marks where they meet
 * (none on the right edge, where the questions' own plus icons line up).
 * The questions are split by faint dashed lines.
 */
export function FaqSection() {
  return (
    <section id="faq" className="w-full pb-32">
      <div className="mx-auto w-full max-w-7xl px-8">
        <div className="relative grid border-y border-border-solid lg:grid-cols-2">
          <CornerPlus className="-top-1.5 -left-1.5" />
          <CornerPlus className="-bottom-1.5 -left-1.5" />
          <CornerPlus className="-top-1.5 left-1/2 hidden -translate-x-1/2 lg:block" />
          <CornerPlus className="-bottom-1.5 left-1/2 hidden -translate-x-1/2 lg:block" />

          <div className="pt-12 pb-12 lg:pb-0 lg:pr-24">
            {/* Numbered like the section headings above it */}
            <h2 className="flex gap-4 text-4xl md:text-5xl">
              <span className="text-yellow">02</span>
              <span>FAQ</span>
            </h2>
            <p className="mt-8">
              Everything you need to know about reviewing with Contrast. Can't find an answer? Our
              team is one message away.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-10">
              <a href="mailto:support@opendiff.dev">Talk to our team</a>
            </Button>
          </div>

          <div className="border-t border-border-solid lg:border-t-0 lg:border-l">
            <Accordion className="gap-0 overflow-visible">
              {FAQS.map((faq) => (
                <AccordionItem
                  key={faq.question}
                  value={faq.question}
                  className="overflow-visible rounded-none border-0 border-b border-dashed border-border-solid last:border-b-0 data-open:border-border-solid"
                >
                  <AccordionTrigger
                    size="lg"
                    indicator="plus"
                    className="py-8 pr-0 pl-0 hover:bg-transparent **:data-[slot=accordion-trigger-icon]:-mr-[13px] **:data-[slot=accordion-trigger-icon]:text-yellow [&_[data-slot=accordion-trigger-icon]_path]:[stroke-width:1px] data-panel-open:bg-transparent lg:pl-10">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent size="lg" className="bg-transparent text-foreground pr-12 pb-8 pl-0 lg:pl-10">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
}
