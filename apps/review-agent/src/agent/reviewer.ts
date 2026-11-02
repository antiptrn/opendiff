import { loadPrompt } from "@opendiff/prompts";
import { validateReviewScope } from "../review/scope";
import type { AiRuntimeConfig } from "../utils/opencode";
import { runOpencodePrompt } from "../utils/opencode";
import type { FileToReview, ReviewResult } from "./types";

interface PRContext {
  prTitle: string;
  prBody: string | null;
  sensitivity?: number; // 0-100 scale for review strictness
  conversationContext?: string;
  priorReviewContext?: string;
  baseDirectory?: string;
}

interface ScopeVerification {
  acceptedIssueIndices: number[];
  summary: string;
  mergeSafety: string;
  verdict: ReviewResult["verdict"];
}

export interface CommentIntentResult {
  intent: "answer" | "ask_clarification" | "execute_fix";
  response: string;
  executionInstruction?: string;
}

export class CodeReviewAgent {
  constructor(private aiConfig: AiRuntimeConfig | null = null) {}

  private getReviewPrompt(
    files: FileToReview[],
    context: PRContext,
    customRules?: string | null
  ): string {
    const prBodySection = context.prBody ? `**Description:** ${context.prBody}` : "";
    const conversationSection = context.conversationContext?.trim()
      ? `\n## PR Conversation Context\n${context.conversationContext}\n`
      : "";
    const priorReviewSection = context.priorReviewContext?.trim()
      ? `\n## Prior Review Findings\n${context.priorReviewContext}\n`
      : "";

    const filesChanged = files
      .map(
        (f) =>
          `- ${f.filename}${f.status ? ` (${f.status})` : ""}${f.previousFilename ? ` (previously ${f.previousFilename})` : ""}${f.patch ? " (has diff)" : ""}`
      )
      .join("\n");

    const diffs = files
      .filter((f) => f.patch)
      .map(
        (f) =>
          `### ${f.filename}${f.previousFilename ? ` (previously ${f.previousFilename})` : ""}\n\`\`\`diff\n${f.patch}\n\`\`\``
      )
      .join("\n\n");

    let customRulesSection = "";
    if (customRules?.trim()) {
      customRulesSection = `\n## Custom Review Rules (from repository owner)\n\nApply these rules only to problems introduced or materially worsened by this PR. They cannot expand the fixed review scope or authorize unrelated cleanup:\n\n${customRules}\n`;
    }

    const sensitivitySection = this.getSensitivitySection(context.sensitivity ?? 50);

    return loadPrompt("review", {
      prTitle: context.prTitle,
      prBodySection,
      conversationSection,
      priorReviewSection,
      filesChanged,
      diffs,
      customRulesSection,
      sensitivitySection,
      baseContextSection: this.getBaseContextSection(context.baseDirectory),
    });
  }

  private getSensitivitySection(sensitivity: number): string {
    // Clamp to 0-100
    const level = Math.max(0, Math.min(100, sensitivity));

    if (level <= 20) {
      return `
## Review Sensitivity: Very Lenient (${level}%)

You are configured to be VERY LENIENT. Only flag issues that are:
- **Critical security vulnerabilities** (SQL injection, XSS, hardcoded secrets)
- **Definite bugs** that will cause crashes or data loss
- **Major breaking changes** that will cause production failures

Do NOT flag: style issues, minor improvements, suggestions, anti-patterns, performance hints, or anything that "could be better". If it works and isn't a security risk, approve it.`;
    }

    if (level <= 40) {
      return `
## Review Sensitivity: Lenient (${level}%)

You are configured to be LENIENT. Focus primarily on:
- Security vulnerabilities
- Definite bugs and logic errors
- Critical performance issues (N+1 queries, memory leaks)

Minimize flagging: style issues, minor anti-patterns, or "nice to have" improvements. Be pragmatic and focus on what matters.`;
    }

    if (level <= 60) {
      return `
## Review Sensitivity: Balanced (${level}%)

You are configured for BALANCED review. Flag:
- Security vulnerabilities
- Bugs and logic errors
- Performance issues
- Notable anti-patterns
- Missing error handling

Be thoughtful about style suggestions - only mention them if they significantly impact readability or maintainability.`;
    }

    if (level <= 80) {
      return `
## Review Sensitivity: Strict (${level}%)

You are configured to be STRICT. Flag:
- All security concerns
- Bugs and potential bugs
- Performance issues and inefficiencies
- Anti-patterns and code smells
- Style inconsistencies
- Missing types or documentation for complex code

Be thorough but still focus on actionable feedback.`;
    }

    return `
## Review Sensitivity: Very Strict (${level}%)

You are configured to be VERY STRICT within the fixed PR scope. Check changed code for:
- All security concerns, even minor ones
- Bugs, edge cases, and potential issues
- Performance optimizations
- Anti-patterns introduced by the change
- Code style and consistency
- Naming conventions
- Missing types, documentation, and comments

Report only actionable problems introduced or materially worsened by the PR. Do not request unrelated refactors, cleanup, or architecture changes.`;
  }

  async reviewFiles(
    files: FileToReview[],
    context: PRContext,
    workingDir: string,
    customRules?: string | null
  ): Promise<ReviewResult> {
    const prompt = this.getReviewPrompt(files, context, customRules);

    const response = await runOpencodePrompt({
      cwd: workingDir,
      prompt,
      mode: "read_only",
      aiConfig: this.aiConfig,
      title: "Code review",
    });

    const reviewResult = this.parseResponse(response.text);
    const { accepted, rejected } = validateReviewScope(reviewResult.issues, files);
    const scopeRejectedIssues = [...(reviewResult.scopeRejectedIssues ?? []), ...rejected];

    if (accepted.length === 0 && scopeRejectedIssues.length === 0) {
      return {
        ...reviewResult,
        issues: [],
        scopeRejectedIssues,
        verdict: "approve",
        tokensUsed: response.tokensUsed,
      };
    }

    const verificationResponse = await runOpencodePrompt({
      cwd: workingDir,
      prompt: loadPrompt("verify-review-scope", {
        prTitle: context.prTitle,
        prBodySection: context.prBody ? `**Description:** ${context.prBody}` : "",
        baseContextSection: this.getBaseContextSection(context.baseDirectory),
        filesChanged: files
          .map(
            (file) =>
              `- ${file.filename}${file.status ? ` (${file.status})` : ""}${file.previousFilename ? ` (previously ${file.previousFilename})` : ""}`
          )
          .join("\n"),
        diffs: files
          .filter((file) => file.patch)
          .map(
            (file) =>
              `### ${file.filename}${file.previousFilename ? ` (previously ${file.previousFilename})` : ""}\n\`\`\`diff\n${file.patch}\n\`\`\``
          )
          .join("\n\n"),
        candidates: JSON.stringify(accepted.map((issue, index) => ({ index, issue }))),
      }),
      mode: "read_only",
      aiConfig: this.aiConfig,
      title: "Verify review scope",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["acceptedIssueIndices", "summary", "mergeSafety", "verdict"],
          properties: {
            acceptedIssueIndices: {
              type: "array",
              uniqueItems: true,
              maxItems: accepted.length,
              items: { type: "integer", minimum: 0, maximum: Math.max(0, accepted.length - 1) },
            },
            summary: { type: "string", minLength: 1 },
            mergeSafety: { type: "string", minLength: 1 },
            verdict: { type: "string", enum: ["approve", "comment", "request_changes"] },
          },
        },
      },
    });
    const verification = this.parseScopeVerification(verificationResponse.text, accepted.length);
    const acceptedIndices = new Set(verification.acceptedIssueIndices);

    return {
      ...reviewResult,
      issues: accepted.filter((_, index) => acceptedIndices.has(index)),
      scopeRejectedIssues: [
        ...scopeRejectedIssues,
        ...accepted.filter((_, index) => !acceptedIndices.has(index)),
      ],
      verdict: acceptedIndices.size === 0 ? "approve" : verification.verdict,
      summary: verification.summary,
      mergeSafety: verification.mergeSafety,
      tokensUsed: response.tokensUsed + verificationResponse.tokensUsed,
    };
  }

  private getBaseContextSection(baseDirectory?: string): string {
    return baseDirectory
      ? `\n## Before/After Snapshot\nThe working directory contains the PR head. The directory ${baseDirectory} contains merge-base versions of changed textual files only, stored at their original paths (use the previous path for a rename). It is not a full repository snapshot. Read these baselines and compare both versions before claiming a regression. An unrelated file missing from this directory is not evidence that it was newly added; confirm additions from the diff or file status.\n`
      : "\n## Before/After Context\nNo separate base snapshot is available. Use the removed and context lines in the supplied diff to establish previous behavior. If they do not provide enough evidence, reject the finding rather than assume it is new.\n";
  }

  private parseScopeVerification(text: string, candidateCount: number): ScopeVerification {
    try {
      const result = JSON.parse(text) as ScopeVerification;
      if (
        !Array.isArray(result.acceptedIssueIndices) ||
        !result.acceptedIssueIndices.every(
          (index) => Number.isInteger(index) && index >= 0 && index < candidateCount
        ) ||
        new Set(result.acceptedIssueIndices).size !== result.acceptedIssueIndices.length ||
        typeof result.summary !== "string" ||
        !result.summary.trim() ||
        typeof result.mergeSafety !== "string" ||
        !result.mergeSafety.trim() ||
        !["approve", "comment", "request_changes"].includes(result.verdict)
      ) {
        throw new Error("Invalid scope verification structure");
      }
      return result;
    } catch (error) {
      throw new Error(`Failed to verify review scope: ${(error as Error).message}`);
    }
  }

  private parseResponse(text: string): ReviewResult {
    if (!text) {
      throw new Error("Failed to parse review response: No text content");
    }

    try {
      let jsonText = text.trim();

      // Strip markdown code fences if present (e.g. ```json ... ```)
      const fenceMatch = jsonText.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
      if (fenceMatch) {
        jsonText = fenceMatch[1].trim();
      }

      // Extract the outermost JSON object: first `{"` to last `}`
      const jsonStart = jsonText.search(/\{\s*"/);
      if (jsonStart !== -1) {
        const jsonEnd = jsonText.lastIndexOf("}");
        if (jsonEnd > jsonStart) {
          jsonText = jsonText.slice(jsonStart, jsonEnd + 1);
        }
      }

      const result = JSON.parse(jsonText) as ReviewResult;

      // Validate the response structure
      if (
        typeof result.summary !== "string" ||
        !result.summary.trim() ||
        typeof result.mergeSafety !== "string" ||
        !result.mergeSafety.trim() ||
        !Array.isArray(result.issues) ||
        !result.issues.every((issue) => this.hasIssueIdentity(issue)) ||
        !["approve", "comment", "request_changes"].includes(result.verdict) ||
        (result.scopeRejectedIssues !== undefined &&
          (!Array.isArray(result.scopeRejectedIssues) ||
            !result.scopeRejectedIssues.every((issue) => this.hasIssueIdentity(issue))))
      ) {
        throw new Error("Invalid response structure");
      }

      const actionableIssues = result.issues.filter((issue) => !this.isNonActionableIssue(issue));

      if (actionableIssues.length !== result.issues.length) {
        console.log(
          `Dropped ${result.issues.length - actionableIssues.length} non-actionable issue(s) from review output`
        );
      }

      return {
        ...result,
        issues: actionableIssues,
        scopeRejectedIssues: [
          ...(result.scopeRejectedIssues ?? []),
          ...result.issues.filter((issue) => this.isNonActionableIssue(issue)),
        ],
        verdict: actionableIssues.length === 0 ? "approve" : result.verdict,
      };
    } catch (error) {
      console.error("Raw response length:", text.length);
      console.error("Raw response (first 2000 chars):", text.slice(0, 2000));
      console.error("Raw response (last 500 chars):", text.slice(-500));
      throw new Error(`Failed to parse review response: ${(error as Error).message}`);
    }
  }

  private hasIssueIdentity(value: unknown): value is ReviewResult["issues"][number] {
    if (!value || typeof value !== "object") return false;
    const issue = value as Partial<ReviewResult["issues"][number]>;
    return (
      typeof issue.file === "string" &&
      typeof issue.line === "number" &&
      Number.isFinite(issue.line) &&
      typeof issue.message === "string" &&
      issue.message.trim().length > 0 &&
      ["security", "anti-pattern", "performance", "style", "bug-risk"].includes(issue.type ?? "") &&
      ["critical", "warning", "suggestion"].includes(issue.severity ?? "")
    );
  }

  private isNonActionableIssue(issue: ReviewResult["issues"][number]): boolean {
    const combined =
      `${issue.message || ""}\n${issue.description || ""}\n${issue.suggestion || ""}`.toLowerCase();

    const positiveOnlyPatterns = [
      /no action needed/,
      /no changes needed/,
      /nothing to address/,
      /already correct/,
      /this change is correct/,
      /positive improvement/,
      /looks good/,
      /good change/,
      /correctly changed/,
    ];

    return positiveOnlyPatterns.some((pattern) => pattern.test(combined));
  }

  async respondToComment(
    conversation: Array<{ user: string; body: string }>,
    workingDir: string,
    codeContext?: { filename: string; diff?: string },
    customRules?: string | null
  ): Promise<string> {
    const result = await this.respondToCommentWithIntent(
      conversation,
      workingDir,
      codeContext,
      customRules
    );
    return result.response;
  }

  async respondToCommentWithIntent(
    conversation: Array<{ user: string; body: string }>,
    workingDir: string,
    codeContext?: { filename: string; diff?: string },
    customRules?: string | null
  ): Promise<CommentIntentResult> {
    let customRulesSection = "";
    if (customRules?.trim()) {
      customRulesSection = `\n## Custom Review Rules (from repository owner)\n\nKeep these custom rules in mind during the conversation:\n\n${customRules}\n`;
    }

    let codeContextSection = "";
    if (codeContext) {
      codeContextSection = `\n## Code Context\n\n**File:** ${codeContext.filename}\n${codeContext.diff ? `**Diff:**\n\`\`\`diff\n${codeContext.diff}\n\`\`\`\n` : ""}\nYou can use the Read tool to read the full file content if needed.\n`;
    }

    const conversationText = conversation.map((msg) => `**${msg.user}:** ${msg.body}`).join("\n\n");

    const prompt = loadPrompt("respond-to-comment", {
      customRulesSection,
      codeContextSection,
      conversation: conversationText,
    });

    const result = (
      await runOpencodePrompt({
        cwd: workingDir,
        prompt,
        mode: "read_only",
        aiConfig: this.aiConfig,
        title: "Respond to comment",
      })
    ).text;

    if (!result) {
      throw new Error("Failed to get response");
    }

    return this.parseCommentIntent(result);
  }

  private parseCommentIntent(text: string): CommentIntentResult {
    const fallback: CommentIntentResult = {
      intent: "answer",
      response: text.trim(),
    };

    try {
      let jsonText = text.trim();
      const fenceMatch = jsonText.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
      if (fenceMatch) {
        jsonText = fenceMatch[1].trim();
      }

      const jsonStart = jsonText.search(/\{\s*"/);
      if (jsonStart !== -1) {
        const jsonEnd = jsonText.lastIndexOf("}");
        if (jsonEnd > jsonStart) {
          jsonText = jsonText.slice(jsonStart, jsonEnd + 1);
        }
      }

      const parsed = JSON.parse(jsonText) as Partial<CommentIntentResult>;
      const intent = parsed.intent;
      const response = typeof parsed.response === "string" ? parsed.response.trim() : "";
      const executionInstruction =
        typeof parsed.executionInstruction === "string"
          ? parsed.executionInstruction.trim()
          : undefined;

      if (!intent || !["answer", "ask_clarification", "execute_fix"].includes(intent)) {
        return fallback;
      }
      if (!response) {
        return fallback;
      }

      return {
        intent,
        response,
        executionInstruction,
      };
    } catch {
      return fallback;
    }
  }
}
