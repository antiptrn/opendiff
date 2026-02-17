import { Separator } from "components/components/ui/separator";
import { EntryList } from "../components";
import type { ChangelogEntry } from "../types";

interface ChangelogFrontmatter {
  date?: string;
  title?: string;
  version?: string;
}

function parseDateFromFilename(filePath: string): Date | null {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})\.md$/);
  if (!match) {
    return null;
  }

  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseVersionLabel(markdown: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  const versionInHeading = heading.match(/v\d+\.\d+\.\d+/i)?.[0];
  return versionInHeading || "unknown";
}

function parseFrontmatter(markdown: string): { metadata: ChangelogFrontmatter; body: string } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { metadata: {}, body: normalized };
  }

  const metadata: ChangelogFrontmatter = {};
  const lines = match[1].split("\n");
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim();
    const value = rest.join(":").trim();
    if (!key || !value) {
      continue;
    }

    if (key === "date") {
      metadata.date = value;
    }
    if (key === "title") {
      metadata.title = value;
    }
    if (key === "version") {
      metadata.version = value;
    }
  }

  const body = normalized.slice(match[0].length);
  return { metadata, body };
}

function parseDate(markdown: string, metadata: ChangelogFrontmatter): Date | null {
  const dateLine = metadata.date || markdown.match(/^Released:\s*(.+)$/im)?.[1]?.trim();
  if (!dateLine) {
    return null;
  }

  const date = new Date(dateLine);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTitle(markdown: string, fallbackVersion: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || `OpenDiff ${fallbackVersion}`;
}

function stripLegacyReleaseLine(markdown: string): string {
  return markdown.replace(/^Released:\s*.+$/im, "").trim();
}

function compareEntries(a: ChangelogEntry, b: ChangelogEntry): number {
  const aTime = a.date ? a.date.getTime() : 0;
  const bTime = b.date ? b.date.getTime() : 0;
  if (aTime !== bTime) {
    return bTime - aTime;
  }

  return b.id.localeCompare(a.id);
}

const rawEntries = import.meta.glob("../../../../../changelog/entries/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const entries: ChangelogEntry[] = Object.entries(rawEntries)
  .map(([path, markdown]) => {
    const fileName = path.split("/").at(-1) || path;
    const { metadata, body } = parseFrontmatter(markdown);
    const cleanedBody = stripLegacyReleaseLine(body);
    const version = metadata.version || parseVersionLabel(cleanedBody);
    const filenameDate = parseDateFromFilename(fileName);

    return {
      id: fileName,
      version,
      title: metadata.title || parseTitle(cleanedBody, version),
      date: parseDate(cleanedBody, metadata) || filenameDate,
      content: cleanedBody,
    };
  })
  .sort(compareEntries);

export function ChangelogPage() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start justify-start px-4 pt-20 md:px-8 md:pt-32 lg:px-8 lg:pt-32">
      <div className="flex min-h-9 w-full flex-row items-start justify-start mb-4">
        <h1 className="lg:text-5xl md:text-5xl text-3xl mt-6 leading-tight">Changelog</h1>
      </div>
      <Separator />
      <EntryList entries={entries} />
      <Separator />
    </section>
  );
}
