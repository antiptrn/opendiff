import { PageContainer } from "@/features/billing/pages/pricing/page-container";
import { PageHeader } from "@/features/billing/pages/pricing/page-header";
import { Button, SearchBar } from "components";
import { useMemo, useState } from "react";
import { ArticleList } from "../components";
import { getAllArticles } from "../lib/articles";

const articles = getAllArticles();
const popularSearches = ["Claude", "Greptile", "Bugbot"];

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
    <PageContainer>
      <PageHeader title="Comparisons" subtitle="Find out how OpenDiff compares to other tools." />
      <SearchBar
        containerClassName="mx-auto mt-9 max-w-150"
        placeholder="Search comparisons..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <div className="mt-6 mb-32 flex flex-row items-center justify-center gap-2">
        <p className="text-sm mr-2">Popular searches:</p>
        {popularSearches.map((searchTerm) => {
          const isActive = normalizedQuery === normalizeSearchValue(searchTerm);
          return (
            <Button
              key={searchTerm}
              size="sm"
              variant={isActive ? "default" : "secondary"}
              onClick={() => setSearchQuery(searchTerm)}
            >
              OpenDiff vs. {searchTerm}
            </Button>
          );
        })}
      </div>
      <ArticleList articles={filteredArticles} searchQuery={searchQuery} />
    </PageContainer>
  );
}
