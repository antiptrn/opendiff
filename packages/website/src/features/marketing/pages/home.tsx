import {
  FAQSection,
  GettingStartedSection,
  HeroSection,
  OpenSourceSection,
} from "@/components/marketing";

export function HomePage() {
  return (
    <section className="p-0 flex w-full items-start justify-center">
      <div className="w-full mx-auto max-w-6xl text-start flex flex-col items-start justify-center">
        <HeroSection />
        <GettingStartedSection />
        <OpenSourceSection />
        <FAQSection />
      </div>
    </section>
  );
}
