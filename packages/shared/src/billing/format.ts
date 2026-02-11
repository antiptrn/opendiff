/** Format a token quota for display (e.g., 2500000 → "2.5M", 8000000 → "8M") */
export function formatTokenQuota(tokens: number): string {
  if (tokens === -1) return "Unlimited";
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    // Show decimal only if needed (2.5M not 8.0M)
    return millions % 1 === 0 ? `${Math.round(millions)}M` : `${millions}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }
  return String(tokens);
}

/** Get the display name for a subscription tier */
export function getTierName(tier?: string | null): string {
  switch (tier) {
    case "SELF_SUFFICIENT":
      return "Self-sufficient";
    case "PRO":
      return "Pro";
    case "ULTRA":
      return "Ultra";
    default:
      return "Free";
  }
}

/** Format a role name to title case */
export function formatRoleName(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/** Format a currency amount (in cents) to a display string */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

/** Format cents to currency string with negative handling */
export function formatCents(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
  return cents < 0 ? `-${formatted}` : formatted;
}

/** Format a date string to a human-readable format */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
