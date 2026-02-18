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

interface ParsedFixResponse {
  status: "fixed" | "needs_clarification" | "cannot_fix";
  explanation: string;
  clarificationQuestion?: string;
}

export class TriageAgent {
  constructor(private aiConfig: AiRuntimeConfig | null = null) {}

  async fixIssue(issue: CodeIssue, workingDir: string): Promise<FixResult> {
    const prompt = loadPrompt("fix-issue", {
      type: issue.type,
      severity: issue.severity,
      file: issue.file,
      line: String(issue.line),
      message: issue.message,
      suggestionLine: issue.suggestion ? `- Suggestion: ${issue.suggestion}` : "",
    });

    try {
      const response = await runOpencodePrompt({
        cwd: workingDir,
        prompt,
        mode: "read_write",
        aiConfig: this.aiConfig,
        title: "Triage autofix",
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
