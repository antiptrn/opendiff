import { describe, expect, it } from "bun:test";
import type { CodeIssue } from "../agent/types";
import { buildIssueFingerprint } from "./issue-fingerprint";
import { buildIssueMarker, extractStoredIssueRecords, toStoredIssueRecord } from "./issue-markers";

const issue: CodeIssue = {
  type: "bug-risk",
  severity: "warning",
  file: "src/consumer.ts",
  line: 12,
  message: "Preserve the caller's expected return value",
  scope: {
    file: "src/api.ts",
    line: 8,
    side: "RIGHT",
    before: "The API returned a user object.",
    after: "The API returns a promise, so this caller reads an undefined id.",
  },
};

describe("scope evidence in issue markers", () => {
  it("preserves evidence through hidden markers for historical scope checks", () => {
    const marker = buildIssueMarker(issue);
    expect(extractStoredIssueRecords(marker)).toEqual([toStoredIssueRecord(issue)]);
    expect(extractStoredIssueRecords(marker)[0].scope).toEqual(issue.scope);
  });

  it("keeps existing issue fingerprints when scope evidence is attached", () => {
    const { scope: _scope, ...legacy } = issue;
    expect(toStoredIssueRecord(issue).fingerprint).toBe(buildIssueFingerprint(legacy));
  });

  it("continues to read legacy markers without scope evidence", () => {
    const { scope: _scope, ...legacy } = issue;
    expect(extractStoredIssueRecords(buildIssueMarker(legacy))).toEqual([
      toStoredIssueRecord(legacy),
    ]);
    expect(extractStoredIssueRecords(buildIssueMarker(legacy))[0].scope).toBeUndefined();
  });
});
