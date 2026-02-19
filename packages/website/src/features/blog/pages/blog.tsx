import { ResourceContainer } from "@/components/layout/resource-container";
import { ResourceHeader } from "@/components/layout/resource-header";
import { ArticleList } from "../components";
import { getAllArticles } from "../lib/articles";

const articles = getAllArticles();

export function BlogPage() {
  return (
    <ResourceContainer>
      <ResourceHeader title="Blog" />
      <ArticleList articles={articles} />
    </ResourceContainer>
  );
}
