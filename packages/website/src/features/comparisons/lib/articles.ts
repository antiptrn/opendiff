import type { ComparisonArticle } from "../types";

interface ComparisonsFrontmatter {
  title?: string;
  description?: string;
  date?: string;
  author?: string;
  tags?: string;
}

function parseFrontmatter(markdown: string): { metadata: ComparisonsFrontmatter; body: string } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);

  if (!match) {
    return { metadata: {}, body: normalized };
  }

  const metadata: ComparisonsFrontmatter = {};

  for (const line of match[1].split("\n")) {
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim();
    const value = rest
      .join(":")
      .trim()
      .replace(/^['\"]|['\"]$/g, "");

    if (!key || !value) {
      continue;
    }

    if (key === "title") {
      metadata.title = value;
    }
    if (key === "description") {
      metadata.description = value;
    }
    if (key === "date") {
      metadata.date = value;
    }
    if (key === "author") {
      metadata.author = value;
    }
    if (key === "tags") {
      metadata.tags = value;
    }
  }

  return { metadata, body: normalized.slice(match[0].length).trim() };
}

function parseDateValue(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnly) {
    const year = Number.parseInt(dateOnly[1], 10);
    const month = Number.parseInt(dateOnly[2], 10) - 1;
    const day = Number.parseInt(dateOnly[3], 10);
    const localDate = new Date(year, month, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toTitleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[>*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDescription(body: string, metadataDescription?: string): string {
  if (metadataDescription) {
    return metadataDescription;
  }

  const firstParagraph = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith("#"));

  if (!firstParagraph) {
    return "";
  }

  return stripMarkdown(firstParagraph).slice(0, 220);
}

function parseTitle(body: string, slug: string, metadataTitle?: string): string {
  if (metadataTitle) {
    return metadataTitle;
  }

  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || toTitleFromSlug(slug);
}

function parseTags(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function compareArticles(a: ComparisonArticle, b: ComparisonArticle): number {
  const aTime = a.publishedAt?.getTime() ?? 0;
  const bTime = b.publishedAt?.getTime() ?? 0;

  if (aTime !== bTime) {
    return bTime - aTime;
  }

  return a.slug.localeCompare(b.slug);
}

const rawArticles = import.meta.glob("../../../../../comparisons/entries/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const articles: ComparisonArticle[] = Object.entries(rawArticles)
  .map(([path, markdown]) => {
    const fileName = path.split("/").at(-1) ?? path;
    const slug = fileName.replace(/\.md$/, "");
    const { metadata, body } = parseFrontmatter(markdown);

    return {
      slug,
      title: parseTitle(body, slug, metadata.title),
      description: parseDescription(body, metadata.description),
      author: metadata.author || "OpenDiff Team",
      publishedAt: parseDateValue(metadata.date),
      content: body,
      tags: parseTags(metadata.tags),
    };
  })
  .sort(compareArticles);

export function getAllArticles(): ComparisonArticle[] {
  return articles;
}

export function getArticleBySlug(slug: string): ComparisonArticle | undefined {
  return articles.find((article) => article.slug === slug);
}
