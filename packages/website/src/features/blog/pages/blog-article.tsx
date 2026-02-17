import { Separator } from "components/components/ui/separator";
import { useParams } from "react-router-dom";
import { ArticleContent, BackToBlogLink } from "../components";
import { getArticleBySlug } from "../lib/articles";

function formatDayLabel(value: Date | null): string {
  if (!value) {
    return "Undated";
  }

  return value.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? getArticleBySlug(slug) : undefined;

  if (!article) {
    return (
      <section className="mx-auto flex max-w-6xl flex-col items-start justify-start gap-6 px-4 py-20 md:px-8 md:py-28 lg:px-8 lg:py-32">
        <BackToBlogLink />
        <h1 className="text-3xl font-medium tracking-tight md:text-4xl">Article not found</h1>
        <p className="text-muted-foreground">The requested article does not exist.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start justify-start gap-8 px-4 py-t0 md:px-8 md:pt-28 lg:px-8 lg:pt-32">
      <BackToBlogLink />
      <div className="w-full">
        <p className="mb-6 text-sm text-muted-foreground">{formatDayLabel(article.publishedAt)}</p>
        <h1 className="mb-4 text-3xl font-medium tracking-tight md:text-5xl">{article.title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">By {article.author}</p>
        <Separator />
      </div>
      <div className="w-full">
        <ArticleContent content={article.content} />
      </div>
      <Separator />
    </section>
  );
}
