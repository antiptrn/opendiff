import { Card, CardContent } from "@/components/ui/card";
import { Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "Antiptrn transformed how our team works. We shipped our entire Q4 roadmap in just 6 weeks after implementing their AI workflow recommendations.",
    author: "Sarah Chen",
    role: "VP Engineering",
    company: "TechCorp",
  },
  {
    quote:
      "The training program was exceptional. Our developers went from skeptical to enthusiastic AI adopters within the first week.",
    author: "Marcus Johnson",
    role: "Engineering Manager",
    company: "StartupX",
  },
  {
    quote:
      "We were worried about security and compliance, but Antiptrn helped us implement AI tools that meet all our enterprise requirements.",
    author: "Emily Rodriguez",
    role: "CTO",
    company: "DevFlow",
  },
  {
    quote:
      "The ROI was immediate. Code review time dropped by 60% and our developers are shipping features faster than ever.",
    author: "David Kim",
    role: "Director of Engineering",
    company: "CodeBase",
  },
  {
    quote:
      "Antiptrn doesn't just implement tools - they transform your entire engineering culture around AI-augmented development.",
    author: "Lisa Thompson",
    role: "Head of Platform",
    company: "BuildFast",
  },
  {
    quote:
      "Our junior developers are now performing at mid-level thanks to the AI-assisted workflows Antiptrn set up for us.",
    author: "James Wilson",
    role: "Engineering Lead",
    company: "ScaleUp",
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">What Our Clients Say</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Engineering leaders share their transformation stories
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.author} className="relative">
              <CardContent className="pt-6">
                <Quote className="size-8 text-primary/20 mb-4" />
                <p className="text-muted-foreground mb-6">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                    {testimonial.author
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{testimonial.author}</div>
                    <div className="text-xs text-muted-foreground">
                      {testimonial.role}, {testimonial.company}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
