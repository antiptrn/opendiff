import { Badge, Separator } from "components";
import { Book, Building, Languages, MessageCircle, Scale, SlidersHorizontal } from "lucide-react";
import { AutonomousIterationItems } from "./autonomous-iteration-items";
import FeatureCard from "./feature-card";

export function GettingStartedSection() {
  return (
    <>
      <Separator className="lg:mt-32 md:mt-32 mt-20" />
      <div className="w-full px-8 lg:mt-16 md:mt-16 mt-8">
        <Badge variant="secondary">Features</Badge>
        <h1 className="lg:text-5xl md:text-5xl text-3xl mt-6 leading-tight">
          The most powerful code review tool yet
        </h1>
      </div>
      <div className="flex lg:flex-row md:flex-row flex-col items-center justify-center gap-8 w-full mt-8 px-8">
        <FeatureCard
          className="lg:h-100 md:h-100 h-auto pb-0"
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
    </>
  );
}
