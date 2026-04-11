export interface ComparisonArticle {
  slug: string;
  title: string;
  description: string;
  author: string;
  publishedAt: Date | null;
  content: string;
  tags: string[];
}

export interface ArticleListProps {
  articles: ComparisonArticle[];
  searchQuery?: string;
}

export interface ArticleCardProps {
  article: ComparisonArticle;
}
