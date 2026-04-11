import type { CodeIssue } from "../agent/types";

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

export function buildIssueFingerprint(
  issue: Pick<CodeIssue, "type" | "file" | "line" | "message">
): string {
  const base = [
    issue.type,
    issue.file,
    String(issue.line),
    normalizeText(issue.message || ""),
  ].join("|");
  return hashDjb2(base);
}
