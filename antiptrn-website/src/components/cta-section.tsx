import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, MessageSquare, Calendar } from "lucide-react";

export function CTASection() {
  return (
    <section id="contact" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ready to Transform Your Engineering Team?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Schedule a free consultation to discuss how AI-augmented workflows can accelerate your
              development velocity.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Calendar className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Free Consultation</h3>
                  <p className="text-sm text-muted-foreground">
                    30-minute call to assess your current workflow and identify quick wins
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Custom Proposal</h3>
                  <p className="text-sm text-muted-foreground">
                    Tailored recommendations based on your tech stack and team size
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Direct Contact</h3>
                  <p className="text-sm text-muted-foreground">hello@antiptrn.com</p>
                </div>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-6">
              <form className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="you@company.com" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" placeholder="Your company" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="team-size">Team Size</Label>
                  <Input id="team-size" placeholder="e.g., 10-20 engineers" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Tell us about your goals</Label>
                  <Textarea
                    id="message"
                    placeholder="What challenges are you facing? What would you like to achieve with AI-augmented engineering?"
                    rows={4}
                  />
                </div>

                <Button type="submit" className="w-full" size="lg">
                  Schedule Consultation
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  We'll respond within 24 hours. No spam, ever.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
