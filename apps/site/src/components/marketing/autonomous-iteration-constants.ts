// 0: Analyzing (shimmer)
// 1: Analyzing → Analyzed
// 2: + 4 issues found
// 3: + 2 potential bugs found
// 4: + Fixing (shimmer)
// 5: Fixing → 6 problems fixed automatically (text color transition)
// 6: fade out & reset
export type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const TOTAL_STEPS = 7;

export const STEP_DURATIONS: Record<Step, number> = {
  0: 2000,
  1: 400,
  2: 400,
  3: 400,
  4: 2000,
  5: 3000,
  6: 800,
};

export const ITEM_TRANSITION = { duration: 0.35, ease: "easeOut" as const };

export const CROSSFADE_TRANSITION = { duration: 0.15 };
