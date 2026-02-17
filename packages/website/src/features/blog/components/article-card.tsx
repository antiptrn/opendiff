import { Link } from "react-router-dom";
import type { ArticleCardProps } from "../types";

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

export function ArticleCard({ article }: ArticleCardProps) {
  return (
    <Link
      to={`/blog/${article.slug}`}
      className="group flex h-full flex-col gap-3 rounded-xl border border-border/80 bg-card/30 p-5 transition-colors hover:border-border hover:bg-card/60"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {formatDayLabel(article.publishedAt)}
      </p>
      <h2 className="text-xl tracking-tight text-foreground group-hover:text-primary">
        {article.title}
      </h2>
      {article.description && (
        <p className="text-sm leading-6 text-muted-foreground">{article.description}</p>
      )}
      <p className="mt-auto text-xs text-muted-foreground">By {article.author}</p>
    </Link>
  );
}
