function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/`[^`]+`/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashDjb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function buildIssueFingerprint(issue: {
  type?: string | null;
  file?: string | null;
  line?: number | null;
  message?: string | null;
}): string {
  const base = [
    issue.type || "unknown",
    issue.file || "unknown",
    String(issue.line ?? 0),
    normalizeText(issue.message || ""),
  ].join("|");

  return hashDjb2(base);
}
