import { Check, Clock, Code2, ShieldCheck, TrendingUp, Users } from "lucide-react";

const metrics = [
  { value: "10x", label: "Faster Development" },
  { value: "40%", label: "Less Time on Boilerplate" },
  { value: "60%", label: "Faster Code Reviews" },
  { value: "3x", label: "More Features Shipped" },
];

const benefits = [
  {
    icon: TrendingUp,
    title: "Increased Velocity",
    description:
      "Ship features faster without compromising on quality. AI handles the repetitive work so your team can focus on creative problem-solving.",
  },
  {
    icon: Clock,
    title: "Reduced Time to Market",
    description:
      "Accelerate your development cycles and beat competitors to market with AI-augmented workflows.",
  },
  {
    icon: Code2,
    title: "Higher Code Quality",
    description:
      "AI-assisted code review catches bugs early and enforces consistent coding standards across your codebase.",
  },
  {
    icon: Users,
    title: "Happier Developers",
    description:
      "Eliminate tedious tasks and let your engineers work on challenging, fulfilling problems.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise Security",
    description:
      "Implement AI tools with proper security controls and compliance measures in place.",
  },
  {
    icon: Check,
    title: "Measurable ROI",
    description:
      "Track concrete improvements in velocity, quality, and developer satisfaction with our metrics framework.",
  },
];

export function BenefitsSection() {
  return (
    <section id="benefits" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Why AI-Augmented Engineering?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transform your engineering organization with measurable improvements
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="text-center p-6 rounded-xl bg-background ring-1 ring-border"
            >
              <div className="text-4xl sm:text-5xl font-bold text-primary mb-2">{metric.value}</div>
              <div className="text-sm text-muted-foreground">{metric.label}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit) => (
            <div key={benefit.title} className="flex gap-4">
              <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <benefit.icon className="size-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
