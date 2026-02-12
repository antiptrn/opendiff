import { Link } from "react-router-dom";

interface SubscriptionWarningProps {
  count: number;
  type: "reviews" | "triage";
}

/**
 * Warning banner for paused reviews or triage due to subscription status
 */
export function SubscriptionWarning({ count, type }: SubscriptionWarningProps) {
  if (count === 0) return null;

  const message =
    type === "reviews"
      ? count === 1
        ? "1 repository has reviews paused due to an inactive subscription."
        : `${count} repositories have reviews paused due to an inactive subscription.`
      : count === 1
        ? "1 repository has triage paused due to an inactive or insufficient subscription."
        : `${count} repositories have triage paused due to an inactive or insufficient subscription.`;

  const linkText =
    type === "reviews" ? "Reactivate subscription here" : "Upgrade subscription here";

  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
      <p className="text-amber-600 dark:text-amber-400">{message}</p>
      <Link
        to="/pricing"
        className="inline-flex items-center gap-1 mt-2 text-amber-700 dark:text-amber-300 hover:underline"
      >
        {linkText}
      </Link>
    </div>
  );
}
