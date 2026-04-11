import type { CodeIssue } from "../agent/types";
import { buildIssueFingerprint } from "./issue-fingerprint";

export interface StoredIssueRecord {
  fingerprint: string;
  type: CodeIssue["type"];
  severity: CodeIssue["severity"];
  file: string;
  line: number;
  message: string;
}

const ISSUE_MARKER_REGEX = /<!--\s*opendiff-issue:([A-Za-z0-9+/=]+)\s*-->/g;
const FINGERPRINT_MARKER_REGEX = /<!--\s*opendiff-fingerprint:([a-f0-9]+)\s*-->/g;

export function toStoredIssueRecord(
  issue: Pick<CodeIssue, "type" | "severity" | "file" | "line" | "message">
): StoredIssueRecord {
  return {
    fingerprint: buildIssueFingerprint(issue),
    type: issue.type,
    severity: issue.severity,
    file: issue.file,
    line: issue.line,
    message: issue.message,
  };
}

export function buildIssueMarker(
  issue: Pick<CodeIssue, "type" | "severity" | "file" | "line" | "message">
): string {
  const payload = Buffer.from(JSON.stringify(toStoredIssueRecord(issue)), "utf-8").toString("base64");
  return `<!-- opendiff-issue:${payload} -->`;
}

export function extractStoredIssueRecords(body: string): StoredIssueRecord[] {
  const records: StoredIssueRecord[] = [];

  for (const match of body.matchAll(ISSUE_MARKER_REGEX)) {
    try {
      const encoded = match[1];
      if (!encoded) continue;
      const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as StoredIssueRecord;
      if (
        parsed &&
        typeof parsed.fingerprint === "string" &&
        typeof parsed.file === "string" &&
        typeof parsed.line === "number" &&
        typeof parsed.message === "string"
      ) {
        records.push(parsed);
      }
    } catch {
      // Ignore malformed markers
    }
  }

  return records;
}

export function extractFingerprints(body: string): string[] {
  const fingerprints = new Set<string>();

  for (const record of extractStoredIssueRecords(body)) {
    fingerprints.add(record.fingerprint);
  }

  for (const match of body.matchAll(FINGERPRINT_MARKER_REGEX)) {
    const fingerprint = match[1]?.trim();
    if (fingerprint) {
      fingerprints.add(fingerprint);
    }
  }

  return [...fingerprints];
}
