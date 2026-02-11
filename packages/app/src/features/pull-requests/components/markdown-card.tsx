import { Card, CardContent } from "components/components/ui/card";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

interface MarkdownCardProps {
  content: string;
}

const proseClasses =
  "prose prose-neutral dark:prose-invert max-w-none prose-headings:font-normal prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-a:text-primary prose-a:font-normal prose-a:no-underline [&_a:hover]:underline prose-strong:font-normal prose-b:font-normal prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:font-normal prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-muted prose-pre:border prose-img:rounded-lg";

/**
 * Card for rendering markdown content (readme, license, security, contributing)
 */
export function MarkdownCard({ content }: MarkdownCardProps) {
  return (
    <div className="max-w-4xl">
      <Card>
        <CardContent>
          <article className={proseClasses}>
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {content}
            </Markdown>
          </article>
        </CardContent>
      </Card>
    </div>
  );
}
