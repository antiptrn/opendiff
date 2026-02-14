import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKAssistantMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { loadPrompt } from "@opendiff/prompts";
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
  async fixIssue(issue: CodeIssue, workingDir: string): Promise<FixResult> {
    const prompt = loadPrompt("fix-issue", {
      type: issue.type,
      severity: issue.severity,
      file: issue.file,
      line: String(issue.line),
      message: issue.message,
      suggestionLine: issue.suggestion ? `- Suggestion: ${issue.suggestion}` : "",
    });

    let result = "";
    let lastAssistantText = "";
    let hasChanges = false;
    let totalTokens = 0;

    try {
      for await (const message of query({
        prompt,
        options: {
          cwd: workingDir,
          allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"],
          permissionMode: "acceptEdits",
          maxTurns: 20,
          settingSources: ["user"],
        },
      })) {
        // Track if assistant used edit/write tools and capture text output
        if (message.type === "assistant") {
          const assistantMsg = message as SDKAssistantMessage;
          const content = assistantMsg.message?.content ?? [];
          for (const block of content) {
            if (block.type === "tool_use" && (block.name === "Edit" || block.name === "Write")) {
              hasChanges = true;
            }
            if (block.type === "text" && block.text) {
              lastAssistantText = block.text;
            }
          }
        }

        // Capture the final result
        if (message.type === "result") {
          const resultMsg = message as SDKResultMessage;
          if (resultMsg.subtype === "success") {
            result = resultMsg.result || "";
            // Capture token usage
            const usage = resultMsg.usage;
            if (usage) {
              totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
            }
          } else {
            // Error result — use SDK errors, last agent response, or fallback
            const errorDetail =
              resultMsg.errors?.join(", ") ||
              lastAssistantText ||
              "Agent encountered an error but provided no details";
            return {
              fixed: false,
              explanation: errorDetail,
            };
          }
        }
      }

      const parsed = this.parseFixResponse(result || lastAssistantText);
      if (parsed?.status === "needs_clarification") {
        return {
          fixed: false,
          explanation: parsed.explanation,
          requiresClarification: true,
          clarificationQuestion: parsed.clarificationQuestion,
          tokensUsed: totalTokens,
        };
      }

      if (parsed?.status === "cannot_fix") {
        return {
          fixed: false,
          explanation: parsed.explanation,
          tokensUsed: totalTokens,
        };
      }

      return {
        fixed: hasChanges,
        explanation: parsed?.explanation || result || "Changes applied",
        tokensUsed: totalTokens,
      };
    } catch (error) {
      // SDK has a bug where stream cleanup fails with "line.trim" error
      // If we already have changes/result, ignore the cleanup error
      if (hasChanges && error instanceof TypeError && String(error).includes("trim")) {
        console.warn("Ignoring SDK stream cleanup error");
        const parsed = this.parseFixResponse(result || lastAssistantText);
        return {
          fixed: true,
          explanation: parsed?.explanation || result || "Changes applied",
          tokensUsed: totalTokens,
        };
      }
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
