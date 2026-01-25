import { query } from "@anthropic-ai/claude-agent-sdk";
import type { FileToReview, ReviewResult } from "./types";

interface PRContext {
  prTitle: string;
  prBody: string | null;
}

export class CodeReviewAgent {
  private getReviewPrompt(
    files: FileToReview[],
    context: PRContext,
    customRules?: string | null
  ): string {
    let prompt = `You are antiptrn, a code reviewer specializing in identifying issues in pull requests.

Your job is to analyze code changes and provide constructive, actionable feedback.

## Pull Request
**Title:** ${context.prTitle}
${context.prBody ? `**Description:** ${context.prBody}` : ""}

## Files Changed
${files.map((f) => `- ${f.filename}${f.patch ? " (has diff)" : ""}`).join("\n")}

## Your Task

1. **Read each file** using the Read tool to understand the full context
2. **Analyze the diffs** provided below to understand what changed
3. **Investigate thoroughly** before flagging any issue - check patterns, conventions, and context
4. **Return your review** as valid JSON

## Diffs

${files
  .filter((f) => f.patch)
  .map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``)
  .join("\n\n")}

## What to look for:

### Security Issues (type: "security")
- SQL injection, XSS, command injection
- Hardcoded secrets or credentials
- Insecure cryptography
- Missing input validation
- Authentication/authorization flaws

### Anti-patterns (type: "anti-pattern")
- God objects/classes
- Tight coupling
- Magic numbers/strings
- Copy-paste code
- Callback hell
- Premature optimization

### Performance Issues (type: "performance")
- N+1 queries
- Missing indexes
- Unnecessary re-renders
- Memory leaks
- Blocking operations in async contexts

### Style Issues (type: "style")
- Inconsistent naming
- Missing error handling
- Poor variable names
- Overly complex functions
- Missing types (in TypeScript)

### Bug Risks (type: "bug-risk")
- Off-by-one errors
- Null pointer risks
- Race conditions
- Incorrect logic
- Unhandled edge cases

## Investigation Before Commenting

IMPORTANT: Before flagging any issue, you MUST investigate thoroughly:

1. **Understand the full context** - Use the Read tool to read the complete file, not just the diff. The change might make perfect sense when you see how it fits into the existing code.

2. **Check for patterns** - If you see something that looks wrong, use Grep to check if the same pattern is used elsewhere in the codebase. It might be an established convention.

3. **Consider the PR description** - The author may have explained why certain changes were made.

4. **Assume competence** - The developer likely had a reason for their approach. Only flag something if you're confident it's actually a problem after considering the context.

5. **Avoid false positives** - It's better to miss a minor issue than to flag something that's actually correct.

## Line Number Accuracy

CRITICAL: The line number you report MUST exactly match the code you're commenting on.

1. **Verify before reporting** - Read the file and count lines to find the EXACT line number containing the problematic code.

2. **When in doubt, omit** - If you cannot determine the exact line number, do NOT report the issue.

## Response Format

After your investigation, respond with ONLY valid JSON in this exact format (no other text):
{
  "summary": "Brief overall assessment of the PR",
  "issues": [
    {
      "type": "security|anti-pattern|performance|style|bug-risk",
      "severity": "critical|warning|suggestion",
      "file": "path/to/file.ts",
      "line": 42,
      "endLine": 45,
      "message": "Description of the issue",
      "suggestion": "How to fix it (text explanation)",
      "suggestedCode": "const fixed = 'replacement code';"
    }
  ],
  "verdict": "approve|request_changes|comment"
}

### Field Explanations:
- **line**: The starting line number of the issue
- **endLine**: (optional) The ending line number if the issue spans multiple lines
- **suggestion**: (optional) Text explanation of how to fix
- **suggestedCode**: (optional but PREFERRED) The exact replacement code. This creates a GitHub "suggested change" that the author can accept with one click. The code should replace lines from \`line\` to \`endLine\` (or just \`line\` if single line).

## Guidelines

- Only flag issues you're genuinely confident about after investigation
- Be constructive, not harsh
- Focus on the most important issues
- Line numbers MUST be accurate
- **ALWAYS provide suggestedCode when you can offer a concrete fix** - this is the most helpful feedback
- The suggestedCode must be the EXACT replacement for the line(s), properly indented
- Use "approve" if code is good (minor suggestions OK)
- Use "request_changes" only for critical/security issues
- Use "comment" for moderate issues that should be addressed`;

    if (customRules?.trim()) {
      prompt += `

## Custom Review Rules (from repository owner)

The repository owner has defined the following custom rules that you MUST follow:

${customRules}`;
    }

    prompt += `

Now, read the changed files and provide your review as JSON.`;

    return prompt;
  }

  async reviewFiles(
    files: FileToReview[],
    context: PRContext,
    workingDir: string,
    customRules?: string | null
  ): Promise<ReviewResult> {
    const prompt = this.getReviewPrompt(files, context, customRules);

    let result = "";
    let lastAssistantText = "";

    try {
      for await (const message of query({
        prompt,
        options: {
          cwd: workingDir,
          allowedTools: ["Read", "Glob", "Grep"],
          permissionMode: "default",
          maxTurns: 30,
          settingSources: ["user"],
        },
      })) {
        // Capture text from assistant messages (the actual model output)
        if (message.type === "assistant") {
          const content = (message as any).message?.content || [];
          for (const block of content) {
            if (block.type === "text" && block.text) {
              lastAssistantText = block.text;
            }
          }
        }

        if (message.type === "result") {
          const resultMsg = message as { type: "result"; subtype: string; result?: string; errors?: string[] };
          if (resultMsg.subtype === "success") {
            // Prefer result.result, fall back to last assistant text
            result = resultMsg.result || lastAssistantText || "";
          } else {
            throw new Error(resultMsg.errors?.join(", ") || "Review agent failed");
          }
        }
      }
    } catch (error) {
      // SDK has a bug where stream cleanup fails with "line.trim" error
      // If we already have a result, ignore the cleanup error
      if ((result || lastAssistantText) && error instanceof TypeError && String(error).includes("trim")) {
        console.warn("Ignoring SDK stream cleanup error");
        // Use whatever we captured
        if (!result) result = lastAssistantText;
      } else {
        throw error;
      }
    }

    return this.parseResponse(result);
  }

  private parseResponse(text: string): ReviewResult {
    if (!text) {
      throw new Error("Failed to parse review response: No text content");
    }

    try {
      let jsonText = text.trim();

      // Strategy 1: Find a JSON object by matching balanced braces
      // This handles cases where code blocks appear inside JSON strings
      const jsonStart = jsonText.indexOf("{");
      if (jsonStart !== -1) {
        let depth = 0;
        let inString = false;
        let escape = false;
        let jsonEnd = -1;

        for (let i = jsonStart; i < jsonText.length; i++) {
          const char = jsonText[i];

          if (escape) {
            escape = false;
            continue;
          }

          if (char === "\\") {
            escape = true;
            continue;
          }

          if (char === '"' && !escape) {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === "{") depth++;
            else if (char === "}") {
              depth--;
              if (depth === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
        }

        if (jsonEnd !== -1) {
          jsonText = jsonText.slice(jsonStart, jsonEnd);
        }
      }

      const result = JSON.parse(jsonText) as ReviewResult;

      // Validate the response structure
      if (!result.summary || !Array.isArray(result.issues) || !result.verdict) {
        throw new Error("Invalid response structure");
      }

      return result;
    } catch (error) {
      console.error("Raw response length:", text.length);
      console.error("Raw response (first 2000 chars):", text.slice(0, 2000));
      console.error("Raw response (last 500 chars):", text.slice(-500));
      throw new Error(`Failed to parse review response: ${(error as Error).message}`);
    }
  }

  async respondToComment(
    conversation: Array<{ user: string; body: string }>,
    workingDir: string,
    codeContext?: { filename: string; diff?: string },
    customRules?: string | null
  ): Promise<string> {
    let prompt = `You are antiptrn, a helpful code review assistant. You're having a conversation about code in a GitHub pull request.

## Your role:
- Answer questions about your previous review comments
- Explain your reasoning when asked
- Provide more context or examples if requested
- Acknowledge if you made a mistake
- Help clarify code issues and suggest solutions

## Guidelines:
- Be concise but helpful
- Use code blocks when showing examples
- Stay focused on the code and the review
- Be friendly and constructive
- If you don't know something, say so
- You can use the Read tool to read files and Grep to search the codebase

Respond naturally in markdown format. Do NOT use JSON for conversation responses.`;

    if (customRules?.trim()) {
      prompt += `

## Custom Review Rules (from repository owner)

Keep these custom rules in mind during the conversation:

${customRules}`;
    }

    if (codeContext) {
      prompt += `

## Code Context

**File:** ${codeContext.filename}
${codeContext.diff ? `**Diff:**\n\`\`\`diff\n${codeContext.diff}\n\`\`\`\n` : ""}

You can use the Read tool to read the full file content if needed.`;
    }

    prompt += `

## Conversation

${conversation.map((msg) => `**${msg.user}:** ${msg.body}`).join("\n\n")}

Please respond to the latest message.`;

    let result = "";

    try {
      for await (const message of query({
        prompt,
        options: {
          cwd: workingDir,
          allowedTools: ["Read", "Glob", "Grep"],
          permissionMode: "default",
          maxTurns: 10,
          settingSources: ["user"],
        },
      })) {
        if (message.type === "result") {
          const resultMsg = message as { type: "result"; subtype: string; result?: string; errors?: string[] };
          if (resultMsg.subtype === "success") {
            result = resultMsg.result || "";
          } else {
            throw new Error(resultMsg.errors?.join(", ") || "Comment response agent failed");
          }
        }
      }
    } catch (error) {
      // SDK has a bug where stream cleanup fails with "line.trim" error
      // If we already have a result, ignore the cleanup error
      if (result && error instanceof TypeError && String(error).includes("trim")) {
        console.warn("Ignoring SDK stream cleanup error");
      } else {
        throw error;
      }
    }

    if (!result) {
      throw new Error("Failed to get response");
    }

    return result;
  }
}
