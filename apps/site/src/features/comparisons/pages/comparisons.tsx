import { PageContainer } from "@/features/billing/pages/pricing/page-container";
import { PageHero } from "@/components/layout/page-hero";
import { SearchBar } from "components";
import { useMemo, useState } from "react";
import { ArticleList } from "../components";
import { getAllArticles } from "../lib/articles";

const articles = getAllArticles();

function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ComparisonsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = normalizeSearchValue(searchQuery);

  const filteredArticles = useMemo(() => {
    if (!normalizedQuery) {
      return articles;
    }

    return articles.filter((article) => {
      const haystack = normalizeSearchValue(
        [article.title, article.description, article.author, ...article.tags].join(" ")
      );
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  return (
    <>
      <PageHero title="Comparisons" />
      <PageContainer>
        <SearchBar
          containerClassName="mx-auto mt-9 max-w-150"
          placeholder="Search comparisons..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <ArticleList articles={filteredArticles} searchQuery={searchQuery} />
      </PageContainer>
    </>
  );
}
