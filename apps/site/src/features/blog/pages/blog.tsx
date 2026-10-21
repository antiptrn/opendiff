import { ResourceContainer } from "@/components/layout/resource-container";
import { PageHero } from "@/components/layout/page-hero";
import { ArticleList } from "../components";
import { getAllArticles } from "../lib/articles";

const articles = getAllArticles();

export function BlogPage() {
  return (
    <>
      <PageHero title="Blog" />
      <ResourceContainer>
        <ArticleList articles={articles} />
      </ResourceContainer>
    </>
  );
}
