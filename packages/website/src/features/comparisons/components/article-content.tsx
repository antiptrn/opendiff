import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ArticleContentProps {
  content: string;
}

export function ArticleContent({ content }: ArticleContentProps) {
  return (
    <article className="prose prose-invert max-w-none text-base text-foreground [&_h1]:mt-0 [&_h1]:text-3xl [&_h1]:font-medium [&_h2]:text-2xl [&_h2]:font-medium [&_h3]:font-medium [&_h4]:font-medium [&_h5]:font-medium [&_h6]:font-medium [&_img]:rounded-lg [&_p]:leading-7 [&_ul]:my-3 [&_li]:my-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
  );
}
