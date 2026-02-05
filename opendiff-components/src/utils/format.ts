/**
 * Format a date string to a human-readable format
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Get the display name for a subscription tier
 */
export function getTierName(tier?: string | null): string {
  switch (tier) {
    case "BYOK":
      return "BYOK";
    case "CODE_REVIEW":
      return "Code Review";
    case "TRIAGE":
      return "Triage";
    default:
      return "Free";
  }
}

/**
 * Format a role name to title case
 */
export function formatRoleName(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/**
 * Format a currency amount (in cents) to a display string
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

/**
 * Format cents to currency string with negative handling
 */
export function formatCents(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
  return cents < 0 ? `-${formatted}` : formatted;
}
