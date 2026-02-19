import { Link } from "react-router-dom";
import type { ArticleCardProps } from "../types";
import { Card, CardContent, CardFooter, CardHeader } from "components";

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
    >
      <Card className="gap-0 h-full justify-between">
        <CardHeader className="mb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {formatDayLabel(article.publishedAt)}
          </p>
          <h2 className="text-xl tracking-tight text-foreground group-hover:text-primary">
            {article.title}
          </h2>
        </CardHeader>
        <CardContent className="h-full">
          {article.description && (
            <p className="text-sm leading-6 text-muted-foreground">{article.description}</p>
          )}
        </CardContent>
        <CardFooter>
          <p className="mt-auto text-xs text-muted-foreground">By {article.author}</p>
        </CardFooter>
      </Card>
    </Link>
  );
}
