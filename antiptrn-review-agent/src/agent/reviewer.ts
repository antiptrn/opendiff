import type Anthropic from "@anthropic-ai/sdk";
import type { FileToReview, ReviewResult } from "./types";

const MAX_FILE_CONTENT_LENGTH = 50000; // ~50KB per file to stay within token limits
const MAX_TOTAL_CONTENT_LENGTH = 150000; // ~150KB total

interface PRContext {
  prTitle: string;
  prBody: string | null;
}

export class CodeReviewAgent {
  constructor(private anthropic: Anthropic) {}

  getSystemPrompt(customRules?: string | null): string {
    let prompt = `You are antiptrn, a code reviewer specializing in identifying issues in pull requests.

Your job is to analyze code changes and provide constructive, actionable feedback.

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

## Response Format

You MUST respond with valid JSON in this exact format:
{
  "summary": "Brief overall assessment of the PR",
  "issues": [
    {
      "type": "security|anti-pattern|performance|style|bug-risk",
      "severity": "critical|warning|suggestion",
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of the issue",
      "suggestion": "How to fix it (optional)"
    }
  ],
  "verdict": "approve|request_changes|comment"
}

## Guidelines
- Contextualize each change you review to understand more about the changes and the codebase
- Be constructive, not harsh
- Focus on the most important issues
- Provide specific line numbers when possible
- Include actionable suggestions
- Use "approve" if code is good (minor suggestions OK)
- Use "request_changes" only for critical/security issues
- Use "comment" for moderate issues that should be addressed`;

    // Add custom rules if provided
    if (customRules?.trim()) {
      prompt += `

## Custom Review Rules (from repository owner)

The repository owner has defined the following custom rules that you MUST follow:

${customRules}`;
    }

    return prompt;
  }

  async reviewFiles(
    files: FileToReview[],
    context: PRContext,
    customRules?: string | null
  ): Promise<ReviewResult> {
    const userPrompt = this.buildUserPrompt(files, context);

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: this.getSystemPrompt(customRules),
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    return this.parseResponse(response);
  }

  private buildUserPrompt(files: FileToReview[], context: PRContext): string {
    let prompt = "## Pull Request\n\n";
    prompt += `**Title:** ${context.prTitle}\n`;

    if (context.prBody) {
      prompt += `**Description:** ${context.prBody}\n`;
    }

    prompt += "\n## Files to Review\n\n";

    let totalLength = prompt.length;

    for (const file of files) {
      let content = file.content;

      // Truncate individual files if too large
      if (content.length > MAX_FILE_CONTENT_LENGTH) {
        content = `${content.slice(0, MAX_FILE_CONTENT_LENGTH)}\n... (truncated)`;
      }

      // Check total length
      const fileSection = `### ${file.filename}\n\n\`\`\`\n${content}\n\`\`\`\n\n`;

      if (totalLength + fileSection.length > MAX_TOTAL_CONTENT_LENGTH) {
        prompt += "\n(Additional files omitted due to size limits)\n";
        break;
      }

      if (file.patch) {
        prompt += `### ${file.filename}\n\n**Diff:**\n\`\`\`diff\n${file.patch}\n\`\`\`\n\n`;
        prompt += `**Full content:**\n\`\`\`\n${content}\n\`\`\`\n\n`;
      } else {
        prompt += fileSection;
      }

      totalLength += fileSection.length;
    }

    prompt += "\nPlease review these changes and respond with your analysis in JSON format.";

    return prompt;
  }

  private parseResponse(response: Anthropic.Message): ReviewResult {
    const textContent = response.content.find((c) => c.type === "text");

    if (!textContent || textContent.type !== "text") {
      throw new Error("Failed to parse review response: No text content");
    }

    try {
      // Try to extract JSON from the response
      let jsonText = textContent.text;

      // Handle case where response might have markdown code blocks
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const result = JSON.parse(jsonText) as ReviewResult;

      // Validate the response structure
      if (!result.summary || !Array.isArray(result.issues) || !result.verdict) {
        throw new Error("Invalid response structure");
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to parse review response: ${(error as Error).message}`);
    }
  }

  getConversationSystemPrompt(customRules?: string | null): string {
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

Respond naturally in markdown format. Do NOT use JSON for conversation responses.`;

    // Add custom rules if provided
    if (customRules?.trim()) {
      prompt += `

## Custom Review Rules (from repository owner)

Keep these custom rules in mind during the conversation:

${customRules}`;
    }

    return prompt;
  }

  async respondToComment(
    conversation: Array<{ user: string; body: string }>,
    codeContext?: { filename: string; content: string; diff?: string },
    customRules?: string | null
  ): Promise<string> {
    let prompt = "";

    if (codeContext) {
      prompt += "## Code Context\n\n";
      prompt += `**File:** ${codeContext.filename}\n\n`;
      if (codeContext.diff) {
        prompt += `**Diff:**\n\`\`\`diff\n${codeContext.diff}\n\`\`\`\n\n`;
      }
      prompt += `**Content:**\n\`\`\`\n${codeContext.content.slice(0, 10000)}\n\`\`\`\n\n`;
    }

    prompt += "## Conversation\n\n";
    for (const msg of conversation) {
      prompt += `**${msg.user}:** ${msg.body}\n\n`;
    }

    prompt += "Please respond to the latest message.";

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: this.getConversationSystemPrompt(customRules),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("Failed to get response");
    }

    return textContent.text;
  }
}
