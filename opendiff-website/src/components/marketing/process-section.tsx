import { ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Discovery",
    description:
      "We analyze your current development workflow, tech stack, and team structure to identify opportunities for AI augmentation.",
  },
  {
    number: "02",
    title: "Strategy",
    description:
      "We design a customized roadmap for integrating AI tools that aligns with your business goals and technical requirements.",
  },
  {
    number: "03",
    title: "Implementation",
    description:
      "Our experts work alongside your team to deploy AI tools, establish best practices, and configure optimal workflows.",
  },
  {
    number: "04",
    title: "Training",
    description:
      "Comprehensive hands-on training ensures your team can effectively leverage AI tools for maximum productivity.",
  },
  {
    number: "05",
    title: "Optimization",
    description:
      "Continuous monitoring and refinement of your AI-augmented workflow to ensure sustained improvements.",
  },
];

export function ProcessSection() {
  return (
    <section id="process" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">How We Work</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A proven methodology for transforming your engineering team
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-12 left-0 right-0 h-0.5 bg-border" />

          <div className="grid lg:grid-cols-5 gap-8 lg:gap-4">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                <div className="flex items-center gap-4 lg:flex-col lg:text-center">
                  <div className="relative z-10 size-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                    {step.number}
                  </div>

                  {index < steps.length - 1 && (
                    <ArrowRight className="lg:hidden size-4 text-muted-foreground" />
                  )}

                  <div className="lg:mt-6">
                    <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
