import { describe, expect, it } from "bun:test";
import type { CodeIssue, FileToReview } from "../agent/types";
import { validateReviewScope } from "./scope";

const files: FileToReview[] = [
  {
    filename: "src/save.ts",
    patch:
      "@@ -1,4 +1,4 @@\n const input = read();\n-const value = validate(input);\n+const value = input;\n persist(value);\n return value;",
  },
];

function finding(overrides: Partial<CodeIssue> = {}): CodeIssue {
  return {
    type: "bug-risk",
    severity: "warning",
    file: "src/save.ts",
    line: 2,
    message: "Validate input before persisting it",
    scope: {
      file: "src/save.ts",
      line: 2,
      side: "RIGHT",
      before: "Malformed input was rejected by validate(input).",
      after: "Malformed input is now persisted without validation.",
    },
    ...overrides,
  };
}

describe("validateReviewScope", () => {
  it("accepts evidence anchored to an actual changed line", () => {
    const issue = finding();
    expect(validateReviewScope([issue], files)).toEqual({ accepted: [issue], rejected: [] });
  });

  it("rejects an existing bug anchored to unchanged context beside an edit", () => {
    const issue = finding();
    if (issue.scope) issue.scope.line = 1;
    expect(validateReviewScope([issue], files)).toEqual({ accepted: [], rejected: [issue] });
  });

  it("accepts a regression in an unchanged caller with a changed-code anchor", () => {
    const issue = finding({ file: "src/unchanged-consumer.ts", line: 90 });
    expect(validateReviewScope([issue], files).accepted).toEqual([issue]);
  });

  it("rejects a finding in an unchanged file without a changed-code anchor", () => {
    const issue = finding({ scope: undefined, file: "src/unchanged-consumer.ts" });
    expect(validateReviewScope([issue], files).rejected).toEqual([issue]);
  });

  it("supports deletions as LEFT anchors, including deletion-only hunks", () => {
    const issue = finding();
    if (issue.scope) issue.scope.side = "LEFT";
    const deleted: FileToReview[] = [
      { filename: "src/save.ts", patch: "@@ -2,2 +1,0 @@\n-validate(input);\n-audit(input);" },
    ];
    expect(validateReviewScope([issue], deleted).accepted).toEqual([issue]);
  });

  it("supports file additions and omitted one-line hunk counts", () => {
    const added: FileToReview[] = [
      { filename: "src/save.ts", patch: "@@ -0,0 +1 @@\n+persist(input);" },
    ];
    const issue = finding({ line: 1 });
    if (issue.scope) issue.scope.line = 1;
    expect(validateReviewScope([issue], added).accepted).toEqual([issue]);
  });

  it("uses the previous path for LEFT anchors on renamed files", () => {
    const renamed: FileToReview[] = [{ ...files[0], previousFilename: "src/old-save.ts" }];
    const issue = finding();
    if (issue.scope) {
      issue.scope.file = "src/old-save.ts";
      issue.scope.side = "LEFT";
    }
    expect(validateReviewScope([issue], renamed).accepted).toEqual([issue]);
    if (issue.scope) issue.scope.side = "RIGHT";
    expect(validateReviewScope([issue], renamed).rejected).toEqual([issue]);
  });

  it("accepts a rename-only regression in an unchanged importer using a FILE anchor", () => {
    const renamed: FileToReview[] = [
      {
        filename: "src/new-save.ts",
        previousFilename: "src/save.ts",
        status: "renamed",
      },
    ];
    const issue = finding({
      file: "src/consumer.ts",
      line: 9,
      scope: {
        file: "src/new-save.ts",
        line: 1,
        side: "FILE",
        before: "The unchanged consumer imported src/save.ts successfully.",
        after: "Renaming src/save.ts removes that module, so the consumer import fails.",
      },
    });
    expect(validateReviewScope([issue], renamed)).toEqual({ accepted: [issue], rejected: [] });
  });

  it.each([
    { filename: "src/save.ts", status: "renamed" },
    { filename: "src/save.ts", previousFilename: "src/save.ts", status: "renamed" },
    { filename: "src/save.ts", previousFilename: "src/old.ts" },
    { filename: "src/save.ts", previousFilename: "src/old.ts", status: "modified" },
    { filename: "src/save.ts", previousFilename: "src/old.ts", status: "added" },
    { filename: "src/save.ts", previousFilename: "src/old.ts", status: "copied" },
    { filename: "src/save.ts", previousFilename: "../old.ts", status: "renamed" },
  ])("rejects FILE anchors without valid rename metadata %j", (file) => {
    const issue = finding();
    if (issue.scope) {
      issue.scope.side = "FILE";
      issue.scope.line = 1;
    }
    expect(validateReviewScope([issue], [file])).toEqual({ accepted: [], rejected: [issue] });
  });

  it.each([
    { file: "src/old.ts", line: 1 },
    { file: "src/other.ts", line: 1 },
    { file: "src/save.ts", line: 2 },
    { file: "src/save.ts", line: 0 },
  ])("rejects FILE anchors outside line 1 of the new rename path %j", (anchor) => {
    const issue = finding();
    if (issue.scope) issue.scope = { ...issue.scope, ...anchor, side: "FILE" };
    const renamed: FileToReview[] = [
      { filename: "src/save.ts", previousFilename: "src/old.ts", status: "renamed" },
    ];
    expect(validateReviewScope([issue], renamed)).toEqual({ accepted: [], rejected: [issue] });
  });

  it("validates multiple hunks and counts context separately from changed lines", () => {
    const multiple: FileToReview[] = [
      {
        filename: "src/save.ts",
        patch: "@@ -1 +1 @@\n-old\n+new\n@@ -10,2 +10 @@\n-validate(input);\n persist(input);",
      },
    ];
    const issue = finding();
    if (issue.scope) {
      issue.scope.line = 10;
      issue.scope.side = "LEFT";
    }
    expect(validateReviewScope([issue], multiple).accepted).toEqual([issue]);
    if (issue.scope) issue.scope.side = "RIGHT";
    expect(validateReviewScope([issue], multiple).rejected).toEqual([issue]);
  });

  it("accepts git file headers and no-final-newline markers", () => {
    const fullPatch: FileToReview[] = [
      {
        filename: "src/save.ts",
        patch:
          "diff --git a/src/save.ts b/src/save.ts\nindex 111..222 100644\n--- a/src/save.ts\n+++ b/src/save.ts\n@@ -2 +2 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n",
      },
    ];
    expect(validateReviewScope([finding()], fullPatch).accepted).toHaveLength(1);
  });

  it("distinguishes code beginning with diff-header characters inside a hunk", () => {
    const patch: FileToReview[] = [
      { filename: "src/save.ts", patch: "@@ -2 +2 @@\n---value;\n+++value;" },
    ];
    expect(validateReviewScope([finding()], patch).accepted).toHaveLength(1);
  });

  it.each([
    undefined,
    "",
    "+persist(input);",
    "@@ -1,4 +1,4 @@\n-old\n+new",
    "@@ -2 +2 @@\n-old\n+new\n+extra",
    "@@ -2 +2 @@\n context\n+extra",
    "@@ -2 +2 @@\n-old\n+new\n@@ -1 +1 @@\n-old\n+new",
    "@@ -0 +0 @@\n-old\n+new",
    "@@ -1,0 +1,0 @@",
    "@@ -1 +1 @@\n-old\n+new\nmalformed trailing text",
  ])("fails closed on missing or malformed patch %j", (patch) => {
    const issue = finding();
    expect(validateReviewScope([issue], [{ filename: "src/save.ts", patch }]).rejected).toEqual([
      issue,
    ]);
  });

  it("does not accept anchors from a truncated later hunk", () => {
    const patch = "@@ -2 +2 @@\n-old\n+new\n@@ -20,2 +20,2 @@\n-old\n+new";
    expect(validateReviewScope([finding()], [{ filename: "src/save.ts", patch }]).accepted).toEqual(
      []
    );
  });

  it.each([
    "../src/save.ts",
    "/src/save.ts",
    "src/./save.ts",
    "src//save.ts",
    "C:/save.ts",
    "src\\save.ts",
    "src/save.ts\u0000",
  ])("rejects noncanonical or unsafe paths %j", (path) => {
    const invalidIssue = finding({ file: path });
    const invalidAnchor = finding();
    if (invalidAnchor.scope) invalidAnchor.scope.file = path;
    expect(validateReviewScope([invalidIssue, invalidAnchor], files).accepted).toEqual([]);
    expect(validateReviewScope([finding()], [{ ...files[0], filename: path }]).accepted).toEqual(
      []
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid issue and anchor lines %j",
    (line) => {
      const invalidIssue = finding({ line });
      const invalidAnchor = finding();
      if (invalidAnchor.scope) invalidAnchor.scope.line = line;
      expect(validateReviewScope([invalidIssue, invalidAnchor], files).accepted).toEqual([]);
    }
  );

  it("rejects inverted or invalid issue ranges", () => {
    const inverted = finding({ line: 2, endLine: 1 });
    const fractional = finding({ endLine: 2.5 });
    expect(validateReviewScope([inverted, fractional], files).accepted).toEqual([]);
  });

  it("rejects absent, empty, or identical before/after evidence", () => {
    const missing = finding({ scope: undefined });
    const blank = finding();
    const unchanged = finding();
    if (blank.scope) blank.scope.before = " ";
    if (unchanged.scope) unchanged.scope.after = unchanged.scope.before;
    expect(validateReviewScope([missing, blank, unchanged], files).accepted).toEqual([]);
  });

  it("rejects malformed runtime evidence and unknown sides", () => {
    const malformed = [null, "scope", {}, { ...finding().scope, side: "BOTH" }].map((scope) =>
      finding({ scope: scope as CodeIssue["scope"] })
    );
    expect(validateReviewScope(malformed, files).rejected).toEqual(malformed);
  });

  it("preserves order and identities while partitioning findings", () => {
    const accepted = finding();
    const rejected = finding({ scope: undefined });
    expect(validateReviewScope([rejected, accepted], files)).toEqual({
      accepted: [accepted],
      rejected: [rejected],
    });
  });
});
