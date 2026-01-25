import type Anthropic from "@anthropic-ai/sdk";
import type { CodeIssue } from "./types";

interface ValidationResult {
  valid: boolean;
  reason: string;
}

interface FixResult {
  fixed: boolean;
  explanation: string;
  newContent?: string;
}

export class TriageAgent {
  constructor(private anthropic: Anthropic) {}

  async validateIssue(issue: CodeIssue, fileContent: string): Promise<ValidationResult> {
    const prompt = `You are validating whether a code review issue should be auto-fixed.

## Issue Details
- Type: ${issue.type}
- Severity: ${issue.severity}
- File: ${issue.file}
- Line: ${issue.line}
- Message: ${issue.message}
${issue.suggestion ? `- Suggestion: ${issue.suggestion}` : ""}

## File Content
\`\`\`
${fileContent.slice(0, 20000)}
\`\`\`

## Validation Criteria
An issue should be auto-fixed ONLY if:
1. The issue is clear and unambiguous
2. The fix is straightforward and low-risk
3. The fix won't break other code or tests
4. The issue is definitely a real problem (not a false positive)

Do NOT validate issues that:
- Require architectural changes
- Are subjective style preferences
- Could have multiple valid solutions
- Might break existing functionality
- Need more context to understand

Respond with JSON:
{
  "valid": true/false,
  "reason": "Brief explanation"
}`;

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return { valid: false, reason: "Failed to get validation response" };
    }

    try {
      let jsonText = textContent.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
      return JSON.parse(jsonText) as ValidationResult;
    } catch {
      return { valid: false, reason: "Failed to parse validation response" };
    }
  }

  async fixIssue(issue: CodeIssue, fileContent: string): Promise<FixResult> {
    const prompt = `You are fixing a code review issue. Make the MINIMAL change needed to fix the issue.

## Issue Details
- Type: ${issue.type}
- Severity: ${issue.severity}
- File: ${issue.file}
- Line: ${issue.line}
- Message: ${issue.message}
${issue.suggestion ? `- Suggestion: ${issue.suggestion}` : ""}

## Current File Content
\`\`\`
${fileContent}
\`\`\`

## Instructions
1. Fix ONLY the specific issue mentioned
2. Make the SMALLEST change possible
3. Do NOT refactor other code
4. Do NOT add extra improvements
5. Do NOT change formatting of unrelated code
6. Preserve all existing functionality

Respond with JSON:
{
  "fixed": true/false,
  "explanation": "Brief description of what was changed",
  "newContent": "The complete updated file content (if fixed)"
}

If you cannot fix the issue safely, set "fixed" to false and explain why.`;

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return { fixed: false, explanation: "Failed to get fix response" };
    }

    try {
      let jsonText = textContent.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
      return JSON.parse(jsonText) as FixResult;
    } catch {
      return { fixed: false, explanation: "Failed to parse fix response" };
    }
  }
}
