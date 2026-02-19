import { Separator } from "components";
import { LoaderCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { COMPARISONS_CHUNK_SIZE } from "../constants";
import type { ArticleListProps } from "../types";
import { ArticleCard } from "./article-card";

export function ArticleList({ articles, searchQuery }: ArticleListProps) {
  const [visibleCount, setVisibleCount] = useState(COMPARISONS_CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = visibleCount < articles.length;

  const visibleArticles = useMemo(() => articles.slice(0, visibleCount), [articles, visibleCount]);

  useEffect(() => {
    const nextVisibleCount = Math.min(
      COMPARISONS_CHUNK_SIZE,
      articles.length || COMPARISONS_CHUNK_SIZE
    );
    setVisibleCount(nextVisibleCount);
  }, [articles]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) {
          return;
        }

        setVisibleCount((count) => Math.min(count + COMPARISONS_CHUNK_SIZE, articles.length));
      },
      { threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [articles.length, hasMore]);

  if (articles.length === 0) {
    return (
      <p className="text-muted-foreground mt-8">
        {searchQuery?.trim() ? "No comparisons found matching your search" : "No comparisons yet."}
      </p>
    );
  }

  return (
    <section className="mt-8 flex w-full flex-col">
      <div className="w-full space-y-6">
        {visibleArticles.map((article) => (
          <Fragment key={article.slug}>
            <ArticleCard article={article} />
            <div className="px-6">
              <Separator />
            </div>
          </Fragment>
        ))}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="mt-8 flex w-full justify-center">
          <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </section>
  );
}
