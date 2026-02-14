import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Bot, GitBranch, Shield, Users, Workflow, Zap } from "lucide-react";

const services = [
  {
    icon: Bot,
    title: "AI Tool Integration",
    description:
      "Seamlessly integrate AI coding assistants like Copilot, Claude, and Cursor into your development workflow.",
    features: ["IDE setup & configuration", "Custom prompt engineering", "Context optimization"],
  },
  {
    icon: Workflow,
    title: "Workflow Automation",
    description:
      "Automate repetitive tasks with AI-powered pipelines for code review, testing, and deployment.",
    features: ["CI/CD enhancement", "Automated code review", "Smart testing strategies"],
  },
  {
    icon: GitBranch,
    title: "Codebase Augmentation",
    description:
      "Prepare your codebase for maximum AI assistance with better documentation and structure.",
    features: ["Documentation generation", "Code refactoring", "Architecture optimization"],
  },
  {
    icon: Users,
    title: "Team Training",
    description:
      "Hands-on training programs to help your team effectively leverage AI tools for development.",
    features: ["Workshop sessions", "Best practices guides", "Ongoing mentorship"],
  },
  {
    icon: Shield,
    title: "Security & Compliance",
    description:
      "Implement AI tools while maintaining security standards and regulatory compliance.",
    features: ["Code audit protocols", "Data privacy setup", "Compliance frameworks"],
  },
  {
    icon: Zap,
    title: "Performance Optimization",
    description: "Use AI to identify and fix performance bottlenecks across your entire stack.",
    features: ["Performance profiling", "AI-assisted debugging", "Optimization strategies"],
  },
];

export function ServicesSection() {
  return (
    <section id="services" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Our Services</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Comprehensive solutions to transform your engineering workflow with AI
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <Card key={service.title} className="hover:ring-2 hover:ring-primary/20 transition-all">
              <CardHeader>
                <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <service.icon className="size-6 text-primary" />
                </div>
                <CardTitle>{service.title}</CardTitle>
                <CardDescription>{service.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {service.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <span className="size-1.5 rounded-full bg-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
