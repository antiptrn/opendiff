import { loadPrompt } from "@opendiff/prompts";
import { simpleGit } from "simple-git";
import type { AiRuntimeConfig } from "../utils/opencode";
import { runOpencodePrompt } from "../utils/opencode";
import type { CodeIssue } from "./types";

interface FixResult {
  fixed: boolean;
  explanation: string;
  tokensUsed?: number;
  requiresClarification?: boolean;
  clarificationQuestion?: string;
}

interface FixIssueContext {
  conversationContext?: string;
  autofixIgnoredDirs?: string[];
}

export interface CiFailureDetails {
  name: string;
  conclusion: string;
  headSha: string;
  url?: string | null;
  summary?: string | null;
  text?: string | null;
  annotations?: Array<{
    path: string;
    startLine: number;
    endLine: number;
    annotationLevel: string;
    message: string;
    title: string | null;
    rawDetails: string | null;
  }>;
}

export interface MergeConflictDetails {
  baseBranch: string;
  baseSha: string;
  headBranch: string;
  headSha: string;
  conflictedFiles: string[];
  status: string;
  diff: string;
}

interface ParsedFixResponse {
  status: "fixed" | "needs_clarification" | "cannot_fix";
  explanation: string;
  clarificationQuestion?: string;
}

export class TriageAgent {
  constructor(private aiConfig: AiRuntimeConfig | null = null) {}

  async fixIssue(
    issue: CodeIssue,
    workingDir: string,
    context?: FixIssueContext
  ): Promise<FixResult> {
    const prompt = loadPrompt("fix-issue", {
      type: issue.type,
      severity: issue.severity,
      file: issue.file,
      line: String(issue.line),
      message: issue.message,
      suggestionLine: issue.suggestion ? `- Suggestion: ${issue.suggestion}` : "",
      conversationSection: context?.conversationContext?.trim()
        ? `\n## Review Thread Context\n${context.conversationContext}\n`
        : "",
      ignoredDirsSection:
        context?.autofixIgnoredDirs && context.autofixIgnoredDirs.length > 0
          ? `\n## Autofix Ignored Paths\nDo not edit files matching these path patterns:\n${context.autofixIgnoredDirs.map((dir) => `- ${dir}`).join("\n")}\n`
          : "",
    });

    return this.runFixPrompt(prompt, workingDir, "Triage autofix");
  }

  async fixCiFailure(
    failure: CiFailureDetails,
    workingDir: string,
    context?: { autofixIgnoredDirs?: string[] }
  ): Promise<FixResult> {
    const annotations = (failure.annotations ?? [])
      .map((annotation) => {
        const line =
          annotation.startLine === annotation.endLine
            ? String(annotation.startLine)
            : `${annotation.startLine}-${annotation.endLine}`;
        const title = annotation.title ? `${annotation.title}: ` : "";
        const message = truncateForPrompt(annotation.message, 1000);
        const details = annotation.rawDetails
          ? `\n  Details: ${truncateForPrompt(annotation.rawDetails, 2000)}`
          : "";
        return `- ${annotation.path}:${line} [${annotation.annotationLevel}] ${title}${message}${details}`;
      })
      .join("\n");

    const prompt = loadPrompt("fix-ci-failure", {
      checkName: failure.name,
      conclusion: failure.conclusion,
      headSha: failure.headSha,
      urlLine: failure.url ? `- URL: ${failure.url}` : "",
      summarySection: failure.summary?.trim()
        ? `\n## CI Summary\n${truncateForPrompt(failure.summary.trim(), 4000)}\n`
        : "",
      textSection: failure.text?.trim()
        ? `\n## CI Details\n${truncateForPrompt(failure.text.trim(), 8000)}\n`
        : "",
      annotationsSection: annotations ? `\n## CI Annotations\n${annotations}\n` : "",
      ignoredDirsSection:
        context?.autofixIgnoredDirs && context.autofixIgnoredDirs.length > 0
          ? `\n## Autofix Ignored Paths\nDo not edit files matching these path patterns:\n${context.autofixIgnoredDirs.map((dir) => `- ${dir}`).join("\n")}\n`
          : "",
    });

    return this.runFixPrompt(prompt, workingDir, "CI autofix");
  }

  async fixMergeConflict(
    conflict: MergeConflictDetails,
    workingDir: string,
    context?: { autofixIgnoredDirs?: string[] }
  ): Promise<FixResult> {
    const prompt = loadPrompt("fix-merge-conflict", {
      baseBranch: conflict.baseBranch,
      baseSha: conflict.baseSha,
      headBranch: conflict.headBranch,
      headSha: conflict.headSha,
      conflictedFiles: conflict.conflictedFiles.map((file) => `- ${file}`).join("\n"),
      statusSection: conflict.status.trim()
        ? `\n## Git Status\n${truncateForPrompt(conflict.status.trim(), 4000)}\n`
        : "",
      diffSection: conflict.diff.trim()
        ? `\n## Conflict Diff\n${truncateForPrompt(conflict.diff.trim(), 12000)}\n`
        : "",
      ignoredDirsSection:
        context?.autofixIgnoredDirs && context.autofixIgnoredDirs.length > 0
          ? `\n## Autofix Ignored Paths\nDo not edit files matching these path patterns:\n${context.autofixIgnoredDirs.map((dir) => `- ${dir}`).join("\n")}\n`
          : "",
    });

    return this.runFixPrompt(prompt, workingDir, "Merge conflict autofix");
  }

  private async runFixPrompt(
    prompt: string,
    workingDir: string,
    title: string
  ): Promise<FixResult> {
    try {
      const response = await runOpencodePrompt({
        cwd: workingDir,
        prompt,
        mode: "read_write",
        aiConfig: this.aiConfig,
        title,
      });

      const git = simpleGit(workingDir);
      const status = await git.status();
      const hasChanges = status.files.length > 0;

      const parsed = this.parseFixResponse(response.text);
      if (parsed?.status === "needs_clarification") {
        return {
          fixed: false,
          explanation: parsed.explanation,
          requiresClarification: true,
          clarificationQuestion: parsed.clarificationQuestion,
          tokensUsed: response.tokensUsed,
        };
      }

      if (parsed?.status === "cannot_fix") {
        return {
          fixed: false,
          explanation: parsed.explanation,
          tokensUsed: response.tokensUsed,
        };
      }

      return {
        fixed: hasChanges,
        explanation: parsed?.explanation || response.text || "Changes applied",
        tokensUsed: response.tokensUsed,
      };
    } catch (error) {
      console.error("Triage agent error:", error);
      return {
        fixed: false,
        explanation: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private parseFixResponse(text: string): ParsedFixResponse | null {
    if (!text) return null;

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

      const parsed = JSON.parse(jsonText) as Partial<ParsedFixResponse>;
      const status = parsed.status;
      const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
      const clarificationQuestion =
        typeof parsed.clarificationQuestion === "string"
          ? parsed.clarificationQuestion.trim()
          : undefined;

      if (!status || !["fixed", "needs_clarification", "cannot_fix"].includes(status)) {
        return null;
      }

      return {
        status,
        explanation: explanation || "Processed issue",
        clarificationQuestion,
      };
    } catch {
      return null;
    }
  }
}

function truncateForPrompt(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n[truncated]`;
}
