import { loadPrompt } from "@opendiff/prompts";
import type { AiRuntimeConfig } from "../utils/opencode";
import { runOpencodePrompt } from "../utils/opencode";
import type { CodeIssue, FileToReview, ReviewResult } from "./types";

const ISSUE_TYPES = new Set<CodeIssue["type"]>([
  "anti-pattern",
  "security",
  "performance",
  "style",
  "bug-risk",
]);
const ISSUE_SEVERITIES = new Set<CodeIssue["severity"]>(["critical", "warning", "suggestion"]);
const REVIEW_VERDICTS = new Set<ReviewResult["verdict"]>(["approve", "request_changes", "comment"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deriveIssueMessage(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const sentenceEnd = normalized.search(/[.!?](?:\s|$)/);
  const firstSentence = sentenceEnd === -1 ? normalized : normalized.slice(0, sentenceEnd + 1);

  return firstSentence.length <= 80 ? firstSentence : `${firstSentence.slice(0, 77).trimEnd()}...`;
}

interface PRContext {
  prTitle: string;
  prBody: string | null;
  sensitivity?: number; // 0-100 scale for review strictness
  conversationContext?: string;
  priorReviewContext?: string;
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
      .map((f) => `- ${f.filename}${f.patch ? " (has diff)" : ""}`)
      .join("\n");

    const diffs = files
      .filter((f) => f.patch)
      .map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``)
      .join("\n\n");

    let customRulesSection = "";
    if (customRules?.trim()) {
      customRulesSection = `\n## Custom Review Rules (from repository owner)\n\nThe repository owner has defined the following custom rules that you MUST follow:\n\n${customRules}\n`;
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

You are configured to be VERY STRICT. Perform a comprehensive review covering:
- All security concerns, even minor ones
- Bugs, edge cases, and potential issues
- Performance optimizations
- Anti-patterns and architectural concerns
- Code style and consistency
- Naming conventions
- Missing types, documentation, and comments
- Opportunities for refactoring

Flag anything that could be improved. The goal is to maintain the highest code quality standards.`;
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
    reviewResult.tokensUsed = response.tokensUsed;
    return reviewResult;
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

      const result: unknown = JSON.parse(jsonText);

      // Validate the response structure
      if (
        !isRecord(result) ||
        !getNonEmptyString(result.summary) ||
        !getNonEmptyString(result.mergeSafety) ||
        !Array.isArray(result.issues) ||
        !REVIEW_VERDICTS.has(result.verdict as ReviewResult["verdict"])
      ) {
        throw new Error("Invalid response structure");
      }

      let malformedIssueCount = 0;
      const normalizedIssues = result.issues.flatMap((issue, index) => {
        const normalized = this.normalizeIssue(issue, index);
        if (!normalized) {
          malformedIssueCount++;
        }
        return normalized ? [normalized] : [];
      });
      const actionableIssues = normalizedIssues.filter(
        (issue) => !this.isNonActionableIssue(issue)
      );

      if (actionableIssues.length !== normalizedIssues.length) {
        console.log(
          `Dropped ${normalizedIssues.length - actionableIssues.length} non-actionable issue(s) from review output`
        );
      }

      return {
        summary: getNonEmptyString(result.summary) as string,
        mergeSafety: getNonEmptyString(result.mergeSafety) as string,
        issues: actionableIssues,
        verdict:
          actionableIssues.length === 0
            ? malformedIssueCount > 0
              ? "comment"
              : "approve"
            : (result.verdict as ReviewResult["verdict"]),
      };
    } catch (error) {
      console.error("Raw response length:", text.length);
      console.error("Raw response (first 2000 chars):", text.slice(0, 2000));
      console.error("Raw response (last 500 chars):", text.slice(-500));
      throw new Error(`Failed to parse review response: ${(error as Error).message}`);
    }
  }

  private normalizeIssue(value: unknown, index: number): CodeIssue | null {
    if (!isRecord(value)) {
      console.warn(`Dropped malformed review issue at index ${index}: expected an object`);
      return null;
    }

    const type = value.type as CodeIssue["type"];
    const severity = value.severity as CodeIssue["severity"];
    const file = getNonEmptyString(value.file);
    const line = value.line;

    if (
      !ISSUE_TYPES.has(type) ||
      !ISSUE_SEVERITIES.has(severity) ||
      !file ||
      typeof line !== "number" ||
      !Number.isInteger(line) ||
      line < 0
    ) {
      console.warn(
        `Dropped malformed review issue at index ${index}: invalid type, severity, file, or line`
      );
      return null;
    }

    const description = getNonEmptyString(value.description);
    const suggestion = getNonEmptyString(value.suggestion);
    const explicitMessage = getNonEmptyString(value.message);
    const fallbackMessage = description ?? suggestion;
    const message =
      explicitMessage ?? (fallbackMessage ? deriveIssueMessage(fallbackMessage) : null);

    if (!message) {
      console.warn(`Dropped malformed review issue at index ${index}: missing message`);
      return null;
    }

    if (!explicitMessage) {
      console.warn(`Normalized review issue at index ${index}: derived missing message`);
    }

    const issue: CodeIssue = {
      type,
      severity,
      file,
      line,
      message,
    };

    if (
      typeof value.endLine === "number" &&
      Number.isInteger(value.endLine) &&
      value.endLine >= line
    ) {
      issue.endLine = value.endLine;
    }
    if (description) {
      issue.description = description;
    }
    if (suggestion) {
      issue.suggestion = suggestion;
    }
    if (typeof value.suggestedCode === "string") {
      issue.suggestedCode = value.suggestedCode;
    }

    return issue;
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
