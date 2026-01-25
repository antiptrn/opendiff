import { query } from "@anthropic-ai/claude-agent-sdk";
import type { CodeIssue } from "./types";

interface FixResult {
  fixed: boolean;
  explanation: string;
}

export class TriageAgent {
  async fixIssue(issue: CodeIssue, workingDir: string): Promise<FixResult> {
    const prompt = `You are fixing a code review issue. Here are the details:

## Issue Details
- Type: ${issue.type}
- Severity: ${issue.severity}
- File: ${issue.file}
- Line: ${issue.line}
- Message: ${issue.message}
${issue.suggestion ? `- Suggestion: ${issue.suggestion}` : ""}

## Instructions
1. First, read the file ${issue.file} to understand the context
2. Fix the issue properly - you have FULL FLEXIBILITY to:
   - Modify the file where the issue was found
   - Create NEW files (e.g., extract code to a new utility module)
   - Modify OTHER files if needed (e.g., add imports)
   - Refactor as needed to properly fix the issue
3. If the suggestion says to extract code to a new file, DO IT

Focus on fixing THIS issue correctly. Make the minimal changes needed but don't be afraid to create new files or modify multiple files if that's the right solution.

After making changes, respond with a brief summary of what you changed.`;

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
          const content = (message as any).message?.content || [];
          for (const block of content) {
            if (block.type === "tool_use" && (block.name === "Edit" || block.name === "Write")) {
              hasChanges = true;
            }
          }
        }

        // Capture the final result
        if (message.type === "result") {
          const resultMsg = message as any;
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
