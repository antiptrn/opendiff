import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKAssistantMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { loadPrompt } from "@opendiff/prompts";
import type { FileToReview, ReviewResult } from "./types";

interface PRContext {
  prTitle: string;
  prBody: string | null;
  sensitivity?: number; // 0-100 scale for review strictness
}

export interface CommentIntentResult {
  intent: "answer" | "ask_clarification" | "execute_fix";
  response: string;
  executionInstruction?: string;
}

export class CodeReviewAgent {
  private getReviewPrompt(
    files: FileToReview[],
    context: PRContext,
    customRules?: string | null
  ): string {
    const prBodySection = context.prBody ? `**Description:** ${context.prBody}` : "";

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

    let result = "";
    let lastAssistantText = "";
    let totalTokens = 0;

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
          const assistantMsg = message as SDKAssistantMessage;
          const content = assistantMsg.message?.content ?? [];
          for (const block of content) {
            if (block.type === "text" && block.text) {
              lastAssistantText = block.text;
            }
          }
        }

        if (message.type === "result") {
          const resultMsg = message as SDKResultMessage;
          if (resultMsg.subtype === "success") {
            // Prefer result.result, fall back to last assistant text
            result = resultMsg.result || lastAssistantText || "";
            // Capture token usage
            const usage = resultMsg.usage;
            if (usage) {
              totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
            }
          } else {
            throw new Error(resultMsg.errors?.join(", ") || "Review agent failed");
          }
        }
      }
    } catch (error) {
      // SDK has a bug where stream cleanup fails with "line.trim" error
      // If we already have a result, ignore the cleanup error
      if (
        (result || lastAssistantText) &&
        error instanceof TypeError &&
        String(error).includes("trim")
      ) {
        console.warn("Ignoring SDK stream cleanup error");
        // Use whatever we captured
        if (!result) result = lastAssistantText;
      } else {
        throw error;
      }
    }

    const reviewResult = this.parseResponse(result);
    reviewResult.tokensUsed = totalTokens;
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
          const resultMsg = message as SDKResultMessage;
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
