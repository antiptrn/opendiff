import { ResourceContainer } from "@/components/layout/resource-container";
import { ResourceHeader } from "@/components/layout/resource-header";
import { EntryList } from "../components";
import type { ChangelogEntry } from "../types";

interface ChangelogFrontmatter {
  date?: string;
  title?: string;
  version?: string;
}

function parseDateValue(value: string): Date | null {
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

function parseDateFromFilename(filePath: string): Date | null {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})\.md$/);
  if (!match) {
    return null;
  }

  return parseDateValue(match[1]);
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

  return parseDateValue(dateLine);
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
    <ResourceContainer>
      <ResourceHeader title="Changelog" />
      <EntryList entries={entries} />
    </ResourceContainer>
  );
}
