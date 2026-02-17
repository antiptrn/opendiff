export interface BlogArticle {
  slug: string;
  title: string;
  description: string;
  author: string;
  publishedAt: Date | null;
  content: string;
}

export interface ArticleListProps {
  articles: BlogArticle[];
}

export interface ArticleCardProps {
  article: BlogArticle;
}
