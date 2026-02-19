import { Link } from "react-router-dom";
import type { ArticleCardProps } from "../types";
import { Badge } from "components";

export function ArticleCard({ article }: ArticleCardProps) {
  const updatedLabel = article.publishedAt
    ? article.publishedAt.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    : "an unknown date";

  return (
    <article className="p-6 hover:bg-muted">
      <Link to={`/comparisons/${article.slug}`} className="group block w-full space-y-6">
        <h2 className="mb-4 text-2xl leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
          {article.title}
        </h2>

        {article.description && (
          <p className="max-w-5xl text-lg leading-relaxed text-muted-foreground">
            {article.description}
          </p>
        )}

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <Badge
                key={`${article.slug}-${tag}`}
                variant="secondary"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          <span className="text-primary">Comparisons</span>
          <span className="mx-2">·</span>
          <span>Updated on {updatedLabel}</span>
        </p>
      </Link>
    </article>
  );
}
