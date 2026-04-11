/**
 * Badge showing whether a member has a seat assigned
 */
export function SeatBadge({ hasSeat }: { hasSeat: boolean }) {
  if (!hasSeat) {
    return <span className="text-base text-muted-foreground">No seat</span>;
  }
  return <p className="text-green-600 dark:text-green-400">Assigned</p>;
}
