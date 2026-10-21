import { useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** How long a word stays put once its letters have settled */
const HOLD_MS = 2400;
const LETTER_DURATION_MS = 250;
const EXIT_STAGGER_MS = 17;
const ENTER_STAGGER_MS = 23;
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

type Phase = "idle" | "exit" | "enter";

/**
 * Cycles through words after x.ai's hero: the box eases to the next word's width while the old
 * letters slide up and blur out from the last, then the new ones rise in from the first. Each word
 * holds once settled before the next comes in. Uses CSS animations so letters never flash at the
 * end of a transition.
 */
export function RotatingWord({ words }: { words: readonly string[] }) {
  const reduceMotion = useReducedMotion();
  const [targetIndex, setTargetIndex] = useState(0);
  const [shown, setShown] = useState(words[0]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [width, setWidth] = useState<number | null>(null);
  const [settled, setSettled] = useState(true);
  const measureRef = useRef<HTMLSpanElement>(null);
  const target = words[targetIndex];

  // Once a word has settled, hold it, then move on to the next one
  useEffect(() => {
    if (!settled || reduceMotion || words.length < 2) return;
    const timeout = setTimeout(() => {
      setSettled(false);
      setTargetIndex((i) => (i + 1) % words.length);
    }, HOLD_MS);
    return () => clearTimeout(timeout);
  }, [settled, reduceMotion, words.length]);

  // Measure the incoming word so the box eases to its width while the old letters leave
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure each time the word changes
  useLayoutEffect(() => {
    if (measureRef.current) setWidth(measureRef.current.getBoundingClientRect().width);
  }, [target]);

  // Run the exit, then mount the new word once the last letter has gone
  useEffect(() => {
    if (target === shown) return;
    setPhase("exit");
    const exitMs = LETTER_DURATION_MS + (shown.length - 1) * EXIT_STAGGER_MS;
    const timeout = setTimeout(() => {
      setShown(target);
      setPhase("enter");
    }, exitMs);
    return () => clearTimeout(timeout);
  }, [target, shown]);

  // The new word counts as settled once its last letter has risen in
  useEffect(() => {
    if (phase !== "enter") return;
    const enterMs = LETTER_DURATION_MS + (shown.length - 1) * ENTER_STAGGER_MS;
    const timeout = setTimeout(() => setSettled(true), enterMs);
    return () => clearTimeout(timeout);
  }, [phase, shown]);

  const letters = Array.from(shown);

  return (
    <>
      <span className="sr-only">{words[0]}</span>
      <span
        aria-hidden="true"
        className="relative inline-flex align-bottom"
        style={{
          clipPath: "inset(-4px 0px)",
          width: width ?? undefined,
          transition: `width 300ms ${EASE_OUT}`,
        }}
      >
        {/* Split into letters like the visible word, so the measured width matches exactly */}
        <span ref={measureRef} className="invisible absolute whitespace-nowrap">
          {Array.from(target).map((letter, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: letters repeat within a word
            <span key={i} className="inline-block">
              {letter === " " ? "\u00A0" : letter}
            </span>
          ))}
        </span>
        <span key={shown} className="whitespace-nowrap">
          {letters.map((letter, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: letters repeat within a word
              key={i}
              className="inline-block"
              style={
                phase === "idle"
                  ? undefined
                  : {
                      animation: `${phase === "exit" ? "word-letter-out" : "word-letter-in"} ${LETTER_DURATION_MS}ms ${EASE_OUT} both`,
                      animationDelay: `${
                        phase === "exit"
                          ? (letters.length - 1 - i) * EXIT_STAGGER_MS
                          : i * ENTER_STAGGER_MS
                      }ms`,
                    }
              }
            >
              {letter === " " ? "\u00A0" : letter}
            </span>
          ))}
        </span>
      </span>
    </>
  );
}
