import { mock } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDiffFiles } from "../../../../packages/vscode-extension/src/git/diff";
import type { CodeIssue, FileToReview } from "./types";

let mockPromptResult = "";
let mockPromptShouldFail = false;
let mockPromptError = "Agent failed";
let lastPromptArgs: unknown = null;
let promptCalls: Array<{ title?: string; prompt?: string; cwd?: string }> = [];
let mockVerificationResult: string | null = null;
let mockVerificationShouldFail = false;
let mockAcceptedIssueIndices: number[] = [];

mock.module("../utils/opencode", () => ({
  runOpencodePrompt: async (args: unknown) => {
    lastPromptArgs = args;
    const input = args as { title?: string; prompt?: string; cwd?: string };
    promptCalls.push(input);
    if (mockPromptShouldFail) {
      throw new Error(mockPromptError);
    }

    if (input.title === "Verify review scope") {
      if (mockVerificationShouldFail) {
        throw new Error("Verifier request failed");
      }
      return {
        text:
          mockVerificationResult ??
          JSON.stringify({
            acceptedIssueIndices: mockAcceptedIssueIndices,
            summary: "Verified changes to the reviewed code.",
            mergeSafety: "The reviewed PR changes have been checked against their prior behavior.",
            verdict: mockAcceptedIssueIndices.length > 0 ? "request_changes" : "approve",
          }),
        tokensUsed: 77,
      };
    }

    return {
      text: mockPromptResult,
      tokensUsed: 123,
    };
  },
}));

import { runLocalReview } from "../internal/local-review";
import { CodeReviewAgent } from "./reviewer";

describe("CodeReviewAgent", () => {
  let agent: CodeReviewAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPromptShouldFail = false;
    lastPromptArgs = null;
    promptCalls = [];
    mockVerificationResult = null;
    mockVerificationShouldFail = false;
    mockAcceptedIssueIndices = [];
    mockPromptResult = JSON.stringify({
      summary: "LGTM",
      mergeSafety: "Safe to merge. The reviewed changes do not introduce blocking risk.",
      issues: [],
      verdict: "approve",
    });
    agent = new CodeReviewAgent();
  });

  describe("reviewFiles", () => {
    it("should analyze files and return structured review", async () => {
      const files: FileToReview[] = [
        {
          filename: "src/auth.ts",
          patch: "@@ -0,0 +1,3 @@\n+function login(input) {\n+  return query(input);\n+}",
        },
      ];

      mockPromptResult = JSON.stringify({
        summary: "Found critical security vulnerability in authentication code.",
        mergeSafety:
          "Not safe to merge. The authentication changes expose a concrete SQL injection risk that must be fixed before release.",
        issues: [
          {
            type: "security",
            severity: "critical",
            file: "src/auth.ts",
            line: 3,
            scope: {
              file: "src/auth.ts",
              line: 2,
              side: "RIGHT",
              before: "There was no public login endpoint.",
              after: "The new endpoint concatenates untrusted input into a SQL query.",
            },
            message: "SQL injection vulnerability detected",
            suggestion: "Use parameterized queries instead of string concatenation",
          },
        ],
        verdict: "request_changes",
      });
      mockAcceptedIssueIndices = [0];

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Add login feature", prBody: "Implements user authentication" },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("request_changes");
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe("security");
      expect(result.issues[0].severity).toBe("critical");
    });

    it("should approve clean code", async () => {
      const files: FileToReview[] = [
        {
          filename: "src/utils.ts",
        },
      ];

      mockPromptResult = JSON.stringify({
        summary: "Code looks good. Clean utility function with proper typing.",
        mergeSafety:
          "Safe to merge. The utility change is isolated and does not introduce behavior, security, or performance risk.",
        issues: [],
        verdict: "approve",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Add date utility", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("approve");
      expect(result.issues).toHaveLength(0);
    });

    it("should run in read-only mode", async () => {
      await agent.reviewFiles(
        [{ filename: "src/utils.ts" }],
        { prTitle: "Test auth", prBody: null },
        "/tmp/test-repo"
      );

      const args = lastPromptArgs as { mode?: string; cwd?: string } | null | undefined;
      expect(args?.mode).toBe("read_only");
      expect(args?.cwd).toBe("/tmp/test-repo");
    });

    it("should detect multiple issues across files", async () => {
      const files: FileToReview[] = [
        { filename: "src/api.ts", patch: "@@ -0,0 +1 @@\n+var response = {}" },
        { filename: "src/db.ts", patch: "@@ -0,0 +1 @@\n+eval(input)" },
      ];

      mockPromptResult = JSON.stringify({
        summary: "Multiple issues found across files.",
        mergeSafety:
          "Not safe to merge. The changed files include a critical security issue and a maintainability issue that should be addressed first.",
        issues: [
          {
            type: "style",
            severity: "warning",
            file: "src/api.ts",
            line: 1,
            message: "Use const/let instead of var",
            scope: {
              file: "src/api.ts",
              line: 1,
              side: "RIGHT",
              before: "The response binding did not exist.",
              after: "The new var binding can be reassigned across the handler scope.",
            },
          },
          {
            type: "security",
            severity: "critical",
            file: "src/db.ts",
            line: 1,
            message: "Never use eval with user input",
            scope: {
              file: "src/db.ts",
              line: 1,
              side: "RIGHT",
              before: "Database input was not executed as code.",
              after: "The new eval executes user input as JavaScript.",
            },
          },
        ],
        verdict: "request_changes",
      });
      mockAcceptedIssueIndices = [0, 1];

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Various changes", prBody: "" },
        "/tmp/test-repo"
      );

      expect(result.issues).toHaveLength(2);
      expect(result.issues.map((i) => i.file)).toContain("src/api.ts");
      expect(result.issues.map((i) => i.file)).toContain("src/db.ts");
    });

    it("should handle agent errors gracefully", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];
      mockPromptShouldFail = true;
      mockPromptError = "API rate limit exceeded";

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("API rate limit exceeded");
    });

    it("should handle malformed JSON response", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];
      mockPromptResult = "not valid json {{{";

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("Failed to parse review response");
    });

    it("should reject review responses without generated merge safety", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];
      mockPromptResult = JSON.stringify({
        summary: "LGTM",
        issues: [],
        verdict: "approve",
      });

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("Failed to parse review response");
    });

    it("should filter non-actionable praise issues", async () => {
      const files: FileToReview[] = [{ filename: "src/select.tsx" }];

      mockPromptResult = JSON.stringify({
        summary: "Mostly good changes.",
        mergeSafety:
          "Safe to merge. The semantic wrapper change does not introduce blocking behavior or security risk.",
        issues: [
          {
            type: "style",
            severity: "suggestion",
            file: "src/select.tsx",
            line: 143,
            message: "semantic HTML improvement: h3 changed to span",
            description:
              "This change is correct and improves semantic HTML. No action needed - this is a positive improvement.",
            suggestion: "No action needed.",
          },
        ],
        verdict: "comment",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Refactor Select item wrapper", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.issues).toHaveLength(0);
      expect(result.verdict).toBe("approve");
    });
  });

  describe("edge cases", () => {
    it("should handle empty files array", async () => {
      const files: FileToReview[] = [];

      mockPromptResult = JSON.stringify({
        summary: "No files to review.",
        mergeSafety: "Safe to merge. There are no reviewed code changes that introduce risk.",
        issues: [],
        verdict: "approve",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Empty PR", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("approve");
      expect(result.issues).toHaveLength(0);
    });

    it("should handle JSON response wrapped in markdown code block", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockPromptResult =
        '```json\n{"summary": "LGTM", "mergeSafety": "Safe to merge. The reviewed change has no blocking risk.", "issues": [], "verdict": "approve"}\n```';

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("approve");
      expect(result.summary).toBe("LGTM");
    });

    it("should handle response with extra whitespace around JSON", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockPromptResult =
        '  \n  {"summary": "LGTM", "mergeSafety": "Safe to merge. The reviewed change has no blocking risk.", "issues": [], "verdict": "approve"}  \n  ';

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("approve");
    });

    it("should handle PR with null body", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockPromptResult = JSON.stringify({
        summary: "OK",
        mergeSafety: "Safe to merge. The reviewed change has no blocking risk.",
        issues: [],
        verdict: "approve",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "No description", prBody: null },
        "/tmp/test-repo"
      );

      expect(result).toBeDefined();
    });

    it("should handle PR with empty string body", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockPromptResult = JSON.stringify({
        summary: "OK",
        mergeSafety: "Safe to merge. The reviewed change has no blocking risk.",
        issues: [],
        verdict: "approve",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: "" },
        "/tmp/test-repo"
      );

      expect(result).toBeDefined();
    });

    it("should reject issue with line number 0", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockPromptResult = JSON.stringify({
        summary: "Issue at line 0",
        mergeSafety:
          "Not safe to merge. The general issue needs review before this change can land safely.",
        issues: [
          {
            type: "style",
            severity: "warning",
            file: "test.ts",
            line: 0,
            message: "General comment",
          },
        ],
        verdict: "comment",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.issues).toHaveLength(0);
      expect(result.scopeRejectedIssues).toHaveLength(1);
      expect(result.verdict).toBe("approve");
    });

    it("should handle empty result from agent", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];
      mockPromptResult = "";

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("Failed to parse review response");
    });
  });

  describe("scope verification", () => {
    const files: FileToReview[] = [
      {
        filename: "src/api.ts",
        patch:
          "@@ -1 +1 @@\n-export const getUser = () => ({name: 'Ada'});\n+export const getUser = () => undefined;",
      },
    ];

    function candidate(overrides: Partial<CodeIssue> = {}): CodeIssue {
      return {
        type: "bug-risk",
        severity: "warning",
        file: "src/api.ts",
        line: 1,
        message: "Changed API breaks existing callers",
        scope: {
          file: "src/api.ts",
          line: 1,
          side: "RIGHT",
          before: "getUser returned an object with a name field.",
          after: "getUser now returns undefined, so callers accessing .name throw.",
        },
        ...overrides,
      };
    }

    function reviewWith(issues: CodeIssue[], scopeRejectedIssues: CodeIssue[] = []) {
      mockPromptResult = JSON.stringify({
        summary: "Original summary includes an unverified concern.",
        mergeSafety: "Not safe to merge. The unverified concern must be fixed.",
        issues,
        scopeRejectedIssues,
        verdict: "request_changes",
      });
    }

    function extensionRename(removeValidation: boolean) {
      const dir = mkdtempSync(join(tmpdir(), "opendiff-extension-review-test-"));
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" });
      const oldPath = "src/lib/api.ts";
      const newPath = "src/moved/api.ts";
      const source = [
        'import { readUser } from "./helper";',
        "",
        'export const source = "local";',
        "export const timeout = 30;",
        "",
        "export function getUser(id: string) {",
        '  if (!id) throw new Error("id required");',
        "  return readUser(id);",
        "}",
        "",
        "export const version = 1;",
        "",
      ].join("\n");

      try {
        git("init", "--initial-branch=main");
        git("config", "user.name", "Extension review test");
        git("config", "user.email", "extension-review@example.test");
        mkdirSync(join(dir, "src/lib"), { recursive: true });
        writeFileSync(join(dir, oldPath), source);
        writeFileSync(
          join(dir, "src/lib/helper.ts"),
          "export const readUser = (id: string) => ({id});\n"
        );
        writeFileSync(
          join(dir, "src/consumer.ts"),
          'import { getUser } from "./lib/api";\nexport const user = getUser("1");\n'
        );
        git("add", ".");
        git("commit", "-m", "Add API and unchanged consumer");
        git("checkout", "-b", "move-api");
        mkdirSync(join(dir, "src/moved"), { recursive: true });
        renameSync(join(dir, oldPath), join(dir, newPath));
        if (removeValidation) {
          writeFileSync(
            join(dir, newPath),
            source.replace('  if (!id) throw new Error("id required");\n', "")
          );
        }
        git("add", ".");
        git("commit", "-m", "Move API");

        // This is the real extension payload as transported over its JSON API.
        const payload = JSON.parse(
          JSON.stringify(getDiffFiles(dir, "branch", "main"))
        ) as ReturnType<typeof getDiffFiles>;
        return { dir, payload, oldPath, newPath };
      } catch (error) {
        rmSync(dir, { recursive: true, force: true });
        throw error;
      }
    }

    it("verifies causality against base files and rejects an existing adjacent bug", async () => {
      reviewWith([candidate({ message: "Existing caller has missing error handling" })]);
      mockAcceptedIssueIndices = [];
      const result = await agent.reviewFiles(
        files,
        { prTitle: "Change getUser return value", prBody: null, baseDirectory: "/tmp/repo/base" },
        "/tmp/repo/head"
      );

      expect(result.issues).toHaveLength(0);
      expect(result.scopeRejectedIssues).toHaveLength(1);
      expect(result.summary).toBe("Verified changes to the reviewed code.");
      expect(result.mergeSafety).not.toContain("unverified concern");
      expect(result.verdict).toBe("approve");
      expect(promptCalls).toHaveLength(2);
      expect(promptCalls[1].title).toBe("Verify review scope");
      expect(promptCalls[1].prompt).toContain("/tmp/repo/base");
      expect(promptCalls[1].prompt).toContain("Verify the candidate's `scope.before`");
      expect(promptCalls[1].prompt).toContain("pre-existing defects");
    });

    it("retains a demonstrated regression in an unchanged caller", async () => {
      const issue = candidate({ file: "src/consumer.ts", line: 8 });
      reviewWith([issue]);
      mockAcceptedIssueIndices = [0];
      const result = await agent.reviewFiles(
        files,
        { prTitle: "Change getUser", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.issues).toEqual([issue]);
      expect(result.tokensUsed).toBe(200);
      expect(result.scopeRejectedIssues).toHaveLength(0);
      expect(promptCalls[1].prompt).toContain("unchanged caller");
    });

    it("verifies a rename-only regression in an unchanged import", async () => {
      const issue = candidate({
        file: "src/consumer.ts",
        line: 8,
        message: "Moving the API breaks its existing import",
        scope: {
          file: "src/user.ts",
          line: 1,
          side: "FILE",
          before: "The consumer imports getUser from ./api and src/api.ts exists.",
          after:
            "The file moves to src/user.ts without updating that import, so it cannot resolve.",
        },
      });
      reviewWith([issue]);
      mockAcceptedIssueIndices = [0];
      const result = await agent.reviewFiles(
        [{ filename: "src/user.ts", previousFilename: "src/api.ts", status: "renamed" }],
        { prTitle: "Move the API", prBody: null, baseDirectory: "/tmp/repo/base" },
        "/tmp/test-repo"
      );

      expect(result.issues).toEqual([issue]);
      expect(promptCalls[0].prompt).toContain('scope.side: "FILE"');
      expect(promptCalls[1].prompt).toContain("confirmed rename");
      expect(promptCalls[1].prompt).toContain("src/user.ts (renamed) (previously src/api.ts)");
      expect(promptCalls[1].prompt).toContain("not a full repository snapshot");
      expect(promptCalls[1].prompt).toContain("use the previous path for a rename");
    });

    it("rejects an old defect in unchanged moved code during verification", async () => {
      const issue = candidate({
        file: "src/user.ts",
        message: "Existing API omits input validation",
        scope: {
          file: "src/user.ts",
          line: 1,
          side: "FILE",
          before: "The API at src/api.ts accepted an unvalidated identifier.",
          after: "The same API at src/user.ts still accepts that identifier without validation.",
        },
      });
      reviewWith([issue]);
      mockAcceptedIssueIndices = [];
      const result = await agent.reviewFiles(
        [{ filename: "src/user.ts", previousFilename: "src/api.ts", status: "renamed" }],
        { prTitle: "Move the API", prBody: null },
        "/tmp/test-repo"
      );
      expect(result.issues).toHaveLength(0);
      expect(result.scopeRejectedIssues).toEqual([issue]);
      expect(promptCalls[1].prompt).toContain(
        "Reject pre-existing defects in unchanged moved code"
      );
    });

    it("rebuilds the summary and assessment even when all candidates fail the deterministic gate", async () => {
      const issue = candidate({ scope: undefined });
      reviewWith([issue]);
      const result = await agent.reviewFiles(
        files,
        { prTitle: "Change getUser", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.issues).toHaveLength(0);
      expect(result.scopeRejectedIssues).toEqual([issue]);
      expect(result.summary).not.toContain("unverified concern");
      expect(result.mergeSafety).not.toContain("unverified concern");
      expect(promptCalls).toHaveLength(2);
      expect(promptCalls[1].prompt).toContain("## Candidate Findings\n\n[]");
    });

    it("preserves rejected prior findings for history reconciliation", async () => {
      const prior = candidate({ message: "Prior finding is unrelated" });
      reviewWith([], [prior]);
      const result = await agent.reviewFiles(
        files,
        { prTitle: "Change getUser", prBody: null },
        "/tmp/test-repo"
      );
      expect(result.scopeRejectedIssues).toEqual([prior]);
      expect(result.verdict).toBe("approve");
      expect(promptCalls).toHaveLength(2);
    });

    it("skips the verifier when the primary review has no findings", async () => {
      await agent.reviewFiles(files, { prTitle: "Change getUser", prBody: null }, "/tmp/test-repo");
      expect(promptCalls).toHaveLength(1);
    });

    it("fails closed on invalid verifier indices or assessments", async () => {
      reviewWith([candidate()]);
      const invalidResults = [
        "not JSON",
        JSON.stringify({
          acceptedIssueIndices: [1],
          summary: "Changed API",
          mergeSafety: "OK",
          verdict: "approve",
        }),
        JSON.stringify({
          acceptedIssueIndices: [-1],
          summary: "Changed API",
          mergeSafety: "OK",
          verdict: "approve",
        }),
        JSON.stringify({
          acceptedIssueIndices: [0, 0],
          summary: "Changed API",
          mergeSafety: "OK",
          verdict: "approve",
        }),
        JSON.stringify({
          acceptedIssueIndices: [0.5],
          summary: "Changed API",
          mergeSafety: "OK",
          verdict: "approve",
        }),
        JSON.stringify({
          acceptedIssueIndices: [],
          summary: " ",
          mergeSafety: "OK",
          verdict: "approve",
        }),
        JSON.stringify({
          acceptedIssueIndices: [],
          summary: "Changed API",
          mergeSafety: " ",
          verdict: "approve",
        }),
        JSON.stringify({
          acceptedIssueIndices: [],
          summary: "Changed API",
          mergeSafety: "OK",
          verdict: "unknown",
        }),
      ];
      for (const invalid of invalidResults) {
        mockVerificationResult = invalid;
        await expect(
          agent.reviewFiles(files, { prTitle: "Change getUser", prBody: null }, "/tmp/test-repo")
        ).rejects.toMatchObject({
          message: expect.stringContaining("Failed to verify review scope"),
          tokensUsed: 200,
        });
      }
    });

    it("rejects malformed finding identities before history reconciliation", async () => {
      for (const field of ["issues", "scopeRejectedIssues"]) {
        mockPromptResult = JSON.stringify({
          summary: "Changed API",
          mergeSafety: "Assessment",
          issues: [],
          verdict: "approve",
          [field]: [null],
        });
        await expect(
          agent.reviewFiles(files, { prTitle: "Change getUser", prBody: null }, "/tmp/test-repo")
        ).rejects.toThrow("Failed to parse review response");
      }
    });

    it("uses fixed scope at every sensitivity level, including custom rules", async () => {
      for (const sensitivity of [0, 30, 50, 75, 100]) {
        await agent.reviewFiles(
          files,
          { prTitle: "Change getUser", prBody: null, sensitivity },
          "/tmp/test-repo",
          "Audit every legacy file and suggest architectural cleanup."
        );
        const prompt = (lastPromptArgs as { prompt: string }).prompt;
        expect(prompt).toContain("introduced or materially worsened by this PR");
        expect(prompt).toContain("They cannot expand the fixed review scope");
        expect(prompt).not.toContain("Flag anything that could be improved");
      }
    });

    it("applies the same verification pipeline to local reviews", async () => {
      reviewWith([candidate()]);
      mockAcceptedIssueIndices = [0];
      const result = await runLocalReview({
        files: [
          {
            ...files[0],
            content: "export const getUser = () => undefined;",
            patch: files[0].patch ?? "",
          },
        ],
        title: "Change getUser locally",
        sensitivity: 100,
      });
      expect(result.review.issues).toHaveLength(1);
      expect(result.tokensUsed).toBe(200);
      expect(promptCalls).toHaveLength(2);
      expect(promptCalls[1].prompt).toContain("No separate base snapshot is available");
    });

    it.each([
      { requestFails: true, tokensUsed: 123 },
      { requestFails: false, tokensUsed: 200 },
    ])(
      "preserves local usage when verification fails: $tokensUsed tokens",
      async ({ requestFails, tokensUsed }) => {
        reviewWith([candidate()]);
        mockVerificationShouldFail = requestFails;
        mockVerificationResult = "not JSON";

        await expect(
          runLocalReview({
            files: [
              {
                ...files[0],
                content: "export const getUser = () => undefined;",
                patch: files[0].patch ?? "",
              },
            ],
            title: "Change getUser locally",
            sensitivity: 50,
          })
        ).rejects.toMatchObject({ tokensUsed });
        expect(promptCalls).toHaveLength(2);
        expect(existsSync(promptCalls[0].cwd ?? "")).toBe(false);
      }
    );

    it("retains a rename-only finding through the actual extension JSON payload and local review", async () => {
      const { dir, payload, oldPath, newPath } = extensionRename(false);
      try {
        expect(payload).toHaveLength(1);
        expect(payload[0]).toMatchObject({
          filename: newPath,
          previousFilename: oldPath,
          status: "renamed",
        });
        expect(payload[0].patch).toContain(`rename from ${oldPath}`);
        expect(payload[0].patch).not.toContain("@@");

        const issue = candidate({
          file: "src/consumer.ts",
          line: 1,
          message: "Moving the API breaks the unchanged consumer import",
          scope: {
            file: newPath,
            line: 1,
            side: "FILE",
            before: "The consumer imports ./lib/api and the API reads its adjacent ./helper.",
            after:
              "Moving the API to src/moved/api.ts leaves the consumer import and the API's relative ./helper import unresolved.",
          },
        });
        reviewWith([issue]);
        mockAcceptedIssueIndices = [0];

        const result = await runLocalReview({
          files: payload,
          title: "Move the API module",
          sensitivity: 50,
        });

        expect(result.review.issues).toEqual([issue]);
        expect(result.review.scopeRejectedIssues).toHaveLength(0);
        expect(promptCalls).toHaveLength(2);
        expect(promptCalls[1].title).toBe("Verify review scope");
        expect(promptCalls[1].prompt).toContain(`${newPath} (renamed) (previously ${oldPath})`);
        expect(promptCalls[1].prompt).toContain(`rename from ${oldPath}`);
        expect(promptCalls[1].prompt).toContain(`rename to ${newPath}`);
        expect(existsSync(promptCalls[0].cwd ?? "")).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("retains a LEFT anchor at the original path after an extension rename with edits", async () => {
      const { dir, payload, oldPath, newPath } = extensionRename(true);
      try {
        expect(payload).toHaveLength(1);
        expect(payload[0]).toMatchObject({
          filename: newPath,
          previousFilename: oldPath,
          status: "renamed",
        });
        expect(payload[0].patch).toContain('-  if (!id) throw new Error("id required");');

        const issue = candidate({
          file: newPath,
          line: 7,
          message: "Removing validation passes an empty identifier to the reader",
          scope: {
            file: oldPath,
            line: 7,
            side: "LEFT",
            before: "getUser rejected an empty identifier before calling readUser.",
            after: "The deleted guard now allows an empty identifier to reach readUser.",
          },
        });
        reviewWith([issue]);
        mockAcceptedIssueIndices = [0];

        const result = await runLocalReview({
          files: payload,
          title: "Move the API and remove its guard",
          sensitivity: 50,
        });

        expect(result.review.issues).toEqual([issue]);
        expect(result.review.scopeRejectedIssues).toHaveLength(0);
        expect(promptCalls).toHaveLength(2);
        expect(promptCalls[1].prompt).toContain(`${newPath} (renamed) (previously ${oldPath})`);
        expect(promptCalls[1].prompt).toContain(
          `\"file\":\"${oldPath}\",\"line\":7,\"side\":\"LEFT\"`
        );
        expect(existsSync(promptCalls[0].cwd ?? "")).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("respondToComment", () => {
    it("should respond to conversation", async () => {
      const conversation = [{ user: "developer", body: "Why did you flag this?" }];

      mockPromptResult = "This was flagged because of potential security issues.";

      const response = await agent.respondToComment(conversation, "/tmp/test-repo", {
        filename: "test.ts",
        diff: "+new code",
      });

      expect(response).toContain("security");
    });

    it("should handle agent failure in conversation", async () => {
      const conversation = [{ user: "developer", body: "Question?" }];
      mockPromptShouldFail = true;
      mockPromptError = "Agent failed";

      await expect(agent.respondToComment(conversation, "/tmp/test-repo")).rejects.toThrow(
        "Agent failed"
      );
    });

    it("should handle empty response", async () => {
      const conversation = [{ user: "developer", body: "Question?" }];
      mockPromptResult = "";

      await expect(agent.respondToComment(conversation, "/tmp/test-repo")).rejects.toThrow(
        "Failed to get response"
      );
    });
  });
});
