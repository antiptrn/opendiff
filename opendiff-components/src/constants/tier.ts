/** Tier labels for display */
export const tierLabels: Record<string, string> = {
  BYOK: "BYOK",
  CODE_REVIEW: "Review",
  TRIAGE: "Triage",
};

/** Tier prices per seat (monthly, in dollars) */
export const tierPrices: Record<string, number> = {
  BYOK: 9,
  CODE_REVIEW: 19,
  TRIAGE: 49,
};
