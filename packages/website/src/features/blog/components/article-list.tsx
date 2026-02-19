import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BLOG_CHUNK_SIZE } from "../constants";
import type { ArticleListProps } from "../types";
import { ArticleCard } from "./article-card";

export function ArticleList({ articles }: ArticleListProps) {
  const [visibleCount, setVisibleCount] = useState(BLOG_CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = visibleCount < articles.length;

  const visibleArticles = useMemo(() => articles.slice(0, visibleCount), [articles, visibleCount]);

  useEffect(() => {
    const nextVisibleCount = Math.min(BLOG_CHUNK_SIZE, articles.length || BLOG_CHUNK_SIZE);
    setVisibleCount(nextVisibleCount);
  }, [articles.length]);

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

        setVisibleCount((count) => Math.min(count + BLOG_CHUNK_SIZE, articles.length));
      },
      { threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [articles.length, hasMore]);

  if (articles.length === 0) {
    return <p className="text-muted-foreground">No blog articles yet.</p>;
  }

  return (
    <section className="mt-8 flex w-full flex-col">
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleArticles.map((article) => (
          <ArticleCard key={article.slug} article={article} />
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
