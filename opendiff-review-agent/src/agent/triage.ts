import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKAssistantMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { loadPrompt } from "./load-prompt";
import type { CodeIssue } from "./types";

interface FixResult {
  fixed: boolean;
  explanation: string;
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
    let hasChanges = false;

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
        // Track if assistant used edit/write tools
        if (message.type === "assistant") {
          const assistantMsg = message as SDKAssistantMessage;
          const content = assistantMsg.message?.content ?? [];
          for (const block of content) {
            if (block.type === "tool_use" && (block.name === "Edit" || block.name === "Write")) {
              hasChanges = true;
            }
          }
        }

        // Capture the final result
        if (message.type === "result") {
          const resultMsg = message as SDKResultMessage;
          if (resultMsg.subtype === "success") {
            result = resultMsg.result || "";
            hasChanges = true; // If we got a success result, assume changes were made
          } else {
            // Error result
            return {
              fixed: false,
              explanation: resultMsg.errors?.join(", ") || "Agent failed to fix the issue",
            };
          }
        }
      }

      return {
        fixed: hasChanges,
        explanation: result || "Changes applied",
      };
    } catch (error) {
      // SDK has a bug where stream cleanup fails with "line.trim" error
      // If we already have changes/result, ignore the cleanup error
      if (hasChanges && error instanceof TypeError && String(error).includes("trim")) {
        console.warn("Ignoring SDK stream cleanup error");
        return {
          fixed: true,
          explanation: result || "Changes applied",
        };
      }
      console.error("Triage agent error:", error);
      return {
        fixed: false,
        explanation: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
