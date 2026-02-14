import { type MotionProps, motion } from "framer-motion";
import { type JSX, useEffect, useRef, useState } from "react";

type TextScrambleProps = {
  children: string;
  duration?: number;
  speed?: number;
  characterSet?: string;
  as?: React.ElementType;
  className?: string;
  trigger?: boolean;
  onScrambleComplete?: () => void;
} & MotionProps;

const defaultChars = "aeonscru";

export function TextScramble({
  children,
  duration = 0.8,
  speed = 0.04,
  characterSet = defaultChars,
  className,
  as: Component = "p",
  trigger = true,
  onScrambleComplete,
  ...props
}: TextScrambleProps) {
  const MotionComponent = motion.create(Component as keyof JSX.IntrinsicElements);
  const [displayText, setDisplayText] = useState(children);
  const [isAnimating, setIsAnimating] = useState(false);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const textRef = useRef<HTMLSpanElement>(null);
  const text = children;

  // Measure the final text height on mount
  useEffect(() => {
    if (textRef.current) {
      setHeight(textRef.current.offsetHeight);
    }
  }, []);

  useEffect(() => {
    if (!trigger) return;
    if (isAnimating) return;

    setIsAnimating(true);
    const steps = duration / speed;
    let step = 0;

    const interval = setInterval(() => {
      let scrambled = "";
      const progress = step / steps;

      for (let i = 0; i < text.length; i++) {
        if (text[i] === " ") {
          scrambled += " ";
          continue;
        }

        if (progress * text.length > i) {
          scrambled += text[i];
        } else {
          scrambled += characterSet[Math.floor(Math.random() * characterSet.length)];
        }
      }

      setDisplayText(scrambled);
      step++;

      if (step > steps) {
        clearInterval(interval);
        setDisplayText(text);
        setIsAnimating(false);
        onScrambleComplete?.();
      }
    }, speed * 1000);

    return () => clearInterval(interval);
  }, [trigger, text, duration, speed, characterSet, onScrambleComplete, isAnimating]);

  return (
    <MotionComponent className={className} style={{ height, overflow: "hidden" }} {...props}>
      <span ref={textRef} className={height === undefined ? "invisible" : "hidden"}>
        {text}
      </span>
      {height !== undefined && displayText}
    </MotionComponent>
  );
}
