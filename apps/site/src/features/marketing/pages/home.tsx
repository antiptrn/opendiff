import { ClosingCtaSection, FaqSection, FeaturesSection, HeroSection } from "@/components/marketing";

export function HomePage() {
  return (
    <section className="p-0 flex w-full flex-col items-center justify-start">
      <HeroSection />
      <FeaturesSection />
      <FaqSection />
      <ClosingCtaSection />
    </section>
  );
}
