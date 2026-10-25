const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 days ago", "last week", "3 months ago" */
export function formatRelative(value: string) {
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
