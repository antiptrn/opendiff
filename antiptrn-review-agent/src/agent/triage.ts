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

    try {
      let result = "";
      let hasChanges = false;

      for await (const message of query({
        prompt,
        options: {
          cwd: workingDir,
          allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"],
          permissionMode: "acceptEdits",
          maxTurns: 20,
        },
      })) {
        // Track if we made any edits
        if (message.type === "tool_use_summary") {
          const summary = (message as any).summary?.toLowerCase() || "";
          if (summary.includes("edit") || summary.includes("write")) {
            hasChanges = true;
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
      console.error("Triage agent error:", error);
      return {
        fixed: false,
        explanation: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
