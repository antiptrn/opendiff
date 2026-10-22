import { FeatureAscii, type FeatureShape } from "./feature-ascii";
import { SectionHeading } from "./section-heading";

const DOCS_URL = "https://docs.opendiff.dev";

interface Feature {
  name: string;
  headline: string;
  href: string;
  shape: FeatureShape;
}

const FEATURES: Feature[] = [
  {
    name: "Code reviews",
    headline: "Every pull request gets a review that reads the whole diff and the code around it.",
    href: DOCS_URL,
    shape: "arc",
  },
  {
    name: "Auto-fix",
    headline: "Accept a finding and Contrast commits the fix straight to your branch.",
    href: DOCS_URL,
    shape: "stripes",
  },
  {
    name: "Merge safety",
    headline: "A clear verdict on every pull request tells you when it's safe to ship.",
    href: DOCS_URL,
    shape: "rings",
  },
  {
    name: "Rules & skills",
    headline: "Write your team's conventions once and every review follows them.",
    href: DOCS_URL,
    shape: "blob",
  },
  {
    name: "Editor extensions",
    headline: "Run the same review locally in Cursor and VS Code before you push.",
    href: "https://marketplace.visualstudio.com/items?itemName=opendiff.opendiff-local-review",
    shape: "quarter",
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <a
      href={feature.href}
      target="_blank"
      rel="noreferrer"
      // Muted until hovered or focused, so only the card you're on turns yellow
      className="group relative flex aspect-[3/4] w-[300px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-lg bg-muted p-8 text-foreground transition-colors duration-300 hover:bg-yellow hover:text-yellow-foreground focus-visible:bg-yellow focus-visible:text-yellow-foreground sm:w-[340px]"
    >
      {/* Yellow ink on the muted card, dark ink once the card itself turns yellow */}
      <FeatureAscii
        shape={feature.shape}
        className="text-yellow transition-colors duration-300 group-hover:text-yellow-foreground group-focus-visible:text-yellow-foreground"
      />
      <p className="relative text-2xl">{feature.headline}</p>
    </a>
  );
}

/** Horizontally scrolling row of yellow feature cards, each with its own ASCII shape */
export function FeaturesSection() {
  return (
    <section id="features" className="w-full pb-32">
      <div className="mx-auto w-full max-w-7xl px-8">
        <div className="mb-18">
          <SectionHeading
            index={1}
            label="Features"
            title="Everything a reviewer does"
            subtitle="on every pull request"
            description="Every pull request gets a review that reads the whole diff and the code around it."
          />
        </div>
        <div className="-mx-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-8 px-8 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.name} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
