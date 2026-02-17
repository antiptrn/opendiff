import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EntryCellProps } from "../types";

export function EntryCell({ entry }: EntryCellProps) {
  return (
    <article className="prose prose-invert max-w-none text-base text-foreground [&_h1]:mt-0 [&_h1]:lg:text-4xl [&_h1]:md:text-4xl [&_h1]:text-2xl [&_h1]:font-normal [&_h1]:text-foreground [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-foreground [&_p]:leading-6 [&_ul]:my-2 [&_li]:my-0.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
    </article>
  );
}
