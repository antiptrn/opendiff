import { Separator } from "components/components/ui/separator";
import { ArticleList } from "../components";
import { getAllArticles } from "../lib/articles";

const articles = getAllArticles();

export function BlogPage() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start justify-start px-4 md:px-8 lg:pt-38 md:pt-38 pt-14 lg:px-8 lg:pb-16 md:pb-16 pb-0">
      <div className="mb-4 flex min-h-9 w-full flex-row items-start justify-start">
        <h1 className="mt-6 text-3xl leading-tight md:text-5xl lg:text-5xl">Blog</h1>
      </div>
      <Separator />
      <ArticleList articles={articles} />
    </section>
  );
}
