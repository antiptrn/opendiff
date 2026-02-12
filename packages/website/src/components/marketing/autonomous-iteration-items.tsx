import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Bug, TriangleAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CROSSFADE_TRANSITION,
  ITEM_TRANSITION,
  STEP_DURATIONS,
  TOTAL_STEPS,
  type Step,
} from "./autonomous-iteration-constants";

function mutedAfter(step: Step, threshold: number) {
  return `transition-colors duration-300 ${step >= threshold ? "text-muted-foreground" : "text-foreground"}`;
}

function useFlipAnimation(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const prevTop = useRef<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dep triggers the FLIP animation on change
  useLayoutEffect(() => {
    if (!ref.current) return;
    const top = ref.current.getBoundingClientRect().top + window.scrollY;

    if (prevTop.current !== null) {
      const delta = prevTop.current - top;
      if (Math.abs(delta) > 1) {
        ref.current.animate(
          [
            { transform: `translateY(${delta}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 350, easing: "ease-out" },
        );
      }
    }

    prevTop.current = top;
  }, [dep]);

  return ref;
}

function ShimmerText({ children }: { children: string }) {
  return (
    <span className="bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
      {children}
    </span>
  );
}

function FeedItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ITEM_TRANSITION}
      className="flex items-center justify-start gap-2 whitespace-nowrap"
    >
      {children}
    </motion.div>
  );
}

function TextCrossfade({
  shimmer,
  shimmerText,
  resolvedText,
  resolvedClassName,
}: {
  shimmer: boolean;
  shimmerText: string;
  resolvedText: string;
  resolvedClassName?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {shimmer ? (
        <motion.span
          key="shimmer"
          exit={{ opacity: 0 }}
          transition={CROSSFADE_TRANSITION}
          className="flex items-center gap-2"
        >
          <p className="text-base">
            <ShimmerText>{shimmerText}</ShimmerText>
          </p>
        </motion.span>
      ) : (
        <motion.span
          key="resolved"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={CROSSFADE_TRANSITION}
        >
          <p className={`text-base ${resolvedClassName ?? ""}`}>
            {resolvedText}
          </p>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function IconItem({
  step,
  muteAt,
  icon: Icon,
  text,
}: {
  step: Step;
  muteAt: number;
  icon: LucideIcon;
  text: string;
}) {
  const color = mutedAfter(step, muteAt);
  return (
    <>
      <Icon className={`size-4 shrink-0 ${color}`} />
      <p className={`text-base ${color}`}>{text}</p>
    </>
  );
}

function Feed({ step, fixed }: { step: Step; fixed: boolean }) {
  const ref = useFlipAnimation(step);

  return (
    <motion.div
      ref={ref}
      exit={{ opacity: 0, filter: "blur(4px)" }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-3"
    >
      <FeedItem>
        <TextCrossfade
          shimmer={step === 0}
          shimmerText="Analyzing Pull Request #31"
          resolvedText="Analyzed Pull Request #31"
          resolvedClassName={mutedAfter(step, 2)}
        />
      </FeedItem>

      {step >= 2 && (
        <FeedItem>
          <IconItem step={step} muteAt={3} icon={TriangleAlert} text="4 issues found" />
        </FeedItem>
      )}

      {step >= 3 && (
        <FeedItem>
          <IconItem step={step} muteAt={4} icon={Bug} text="2 potential bugs found" />
        </FeedItem>
      )}

      {step >= 4 && (
        <FeedItem>
          <TextCrossfade
            shimmer={!fixed}
            shimmerText="Fixing"
            resolvedText="6 problems fixed automatically"
            resolvedClassName="text-green-400"
          />
        </FeedItem>
      )}
    </motion.div>
  );
}

export function AutonomousIterationItems() {
  const [step, setStep] = useState<Step>(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setStep((prev) => ((prev + 1) % TOTAL_STEPS) as Step);
    }, STEP_DURATIONS[step]);
    return () => clearTimeout(timeout);
  }, [step]);

  const visible = step <= 5;
  const fixed = step >= 5;

  return (
    <div className="relative w-full h-40 flex flex-col justify-end overflow-hidden pb-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent z-10"
      />
      <AnimatePresence>
        {visible && <Feed key="feed" step={step} fixed={fixed} />}
      </AnimatePresence>
    </div>
  );
}
