import { Separator } from "components/components/ui/separator";
import { LoaderCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CHANGELOG_CHUNK_SIZE } from "../constants";
import type { EntryListProps } from "../types";
import { EntryCell } from "./entry-cell";

function formatDayLabel(value: Date | null): string {
  if (!value) {
    return "Undated";
  }

  return value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function EntryList({ entries }: EntryListProps) {
  const [visibleCount, setVisibleCount] = useState(CHANGELOG_CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = visibleCount < entries.length;

  const visibleEntries = useMemo(() => entries.slice(0, visibleCount), [entries, visibleCount]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const first = observerEntries[0];
        if (!first?.isIntersecting) {
          return;
        }

        setVisibleCount((count) => Math.min(count + CHANGELOG_CHUNK_SIZE, entries.length));
      },
      { threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [entries.length, hasMore]);

  if (entries.length === 0) {
    return <p className="text-muted-foreground">No changelog entries yet.</p>;
  }

  return (
    <section className="flex w-full flex-col">
      {visibleEntries.map((entry, index) => (
        <Fragment key={entry.id}>
          <div className="flex w-full lg:py-16 md:py-16 py-8">
            <div className="sticky top-8 mr-8 hidden h-fit self-start lg:flex lg:w-[30%] md:flex md:w-[30%]">
              <h3 className="text-xl text-muted-foreground">{formatDayLabel(entry.date)}</h3>
            </div>
            <div className="flex w-full flex-col gap-6 lg:w-[70%] md:w-[70%]">
              <h3 className="text-lg text-muted-foreground lg:hidden md:hidden">
                {formatDayLabel(entry.date)}
              </h3>
              <EntryCell entry={entry} />
            </div>
          </div>
          {index < visibleEntries.length - 1 && <Separator />}
        </Fragment>
      ))}

      {hasMore && (
        <div ref={sentinelRef} className="mt-2 flex w-full justify-center">
          <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </section>
  );
}
