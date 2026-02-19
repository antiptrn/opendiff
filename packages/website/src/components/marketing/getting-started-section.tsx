import { Badge } from "components";
import { Book, Building, Languages, MessageCircle, Scale, SlidersHorizontal } from "lucide-react";
import { AutonomousIterationItems } from "./autonomous-iteration-items";
import FeatureCard from "./feature-card";

export function GettingStartedSection() {
  return (
    <>
      <div className="w-full flex flex-col items-start justify-start px-8">
        <Badge className="text-base h-8 px-3.5" variant="secondary">Features</Badge>
        <h1 className="lg:text-5xl md:text-5xl text-3xl mt-6 leading-tight">
          The most powerful code review tool yet
        </h1>
      </div>
      <div className="flex lg:flex-row md:flex-row flex-col items-center justify-center gap-8 w-full mt-8 px-8">
        <FeatureCard
          className="lg:h-100 md:h-100 h-auto pb-0"
          title="Recursive reviews"
          description="OpenDiff doesn't just review your code — it fixes issues and commits the changes automatically in a recursive loop."
        >
          <AutonomousIterationItems />
        </FeatureCard>
        <FeatureCard
          grid
          title="Customizable"
          description="We give you the tools to customize the code review process to your team's needs."
        >
          <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted">
            <Book className="size-3.5 shrink-0" />
            <p className="text-sm truncate">Agent skills</p>
          </div>
          <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted">
            <SlidersHorizontal className="size-3.5 shrink-0" />
            <p className="text-sm truncate">Review sensitivity</p>
          </div>
          <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted">
            <Scale className="size-3.5 shrink-0" />
            <p className="text-sm truncate">Custom rules</p>
          </div>
          <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted">
            <Languages className="size-3.5 shrink-0" />
            <p className="text-sm truncate">Frontier models</p>
          </div>
          <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted">
            <MessageCircle className="size-3.5 shrink-0" />
            <p className="text-sm truncate">Two-way communication</p>
          </div>
          <div className="px-4 gap-3.5 py-2 flex items-center justify-start bg-muted">
            <Building className="size-3.5 shrink-0" />
            <p className="text-sm truncate">Enterprise-ready</p>
          </div>
        </FeatureCard>
      </div>
    </>
  );
}
