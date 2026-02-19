import { PageContainer } from "@/features/billing/pages/pricing/page-container";
import { PageHeader } from "@/features/billing/pages/pricing/page-header";
import { useParams } from "react-router-dom";
import { ArticleContent, BackToComparisonsLink } from "../components";
import { getArticleBySlug } from "../lib/articles";

export function ComparisonArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? getArticleBySlug(slug) : undefined;

  if (!article) {
    return (
      <section className="mx-auto flex max-w-6xl flex-col items-start justify-start gap-16 px-4 pt-32 pb-0 md:px-8 md:pt-40 md:pb-16 lg:px-8 lg:pt-40 lg:pb-16">
        <BackToComparisonsLink />
        <h1 className="text-3xl font-medium tracking-tight md:text-4xl">Comparison not found</h1>
      </section>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={article.title} subtitle={article.description} />
      <div className="w-full mt-32">
        <ArticleContent content={article.content} />
      </div>
    </PageContainer>
  );
}
