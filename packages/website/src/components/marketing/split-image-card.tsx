import heroBackground from "assets/public/hero-background.webp";

export default function SplitImageCard() {
  return (
    <div className="w-full lg:h-100 md:h-100 h-auto bg-card rounded-3xl flex flex-row items-start justify-between">
      <div className="p-8 flex w-1/2 flex-col items-start justify-start gap-4">
        <h5 className="text-4xl">Faster reviews, better code</h5>
        <p className="text-muted-foreground">
          Powered by Claude, our industry-leading coding agent catches bugs before they ship to
          production.
        </p>
      </div>
      <div className="w-1/2 text-foreground h-full items-center justify-start gap-4">
        <img
          src={heroBackground}
          alt="Faster reviews, better code"
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  );
}
