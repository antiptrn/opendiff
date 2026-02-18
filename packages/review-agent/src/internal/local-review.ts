import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import type { FilePayload, ReviewResult } from "shared/types";
import type { AiRuntimeConfig } from "../utils/opencode";
import { runOpencodePrompt } from "../utils/opencode";

function getSensitivitySection(sensitivity: number): string {
  const level = Math.max(0, Math.min(100, sensitivity));

  if (level <= 20) {
    return `\n## Review Sensitivity: Very Lenient (${level}%)\n\nOnly flag: critical security vulnerabilities, definite bugs, major breaking changes. Do NOT flag style issues, minor improvements, or anything that "could be better".`;
  }
  if (level <= 40) {
    return `\n## Review Sensitivity: Lenient (${level}%)\n\nFocus on: security vulnerabilities, definite bugs, critical performance issues. Minimize flagging style issues or "nice to have" improvements.`;
  }
  if (level <= 60) {
    return `\n## Review Sensitivity: Balanced (${level}%)\n\nFlag: security vulnerabilities, bugs, performance issues, notable anti-patterns, missing error handling. Be thoughtful about style suggestions.`;
  }
  if (level <= 80) {
    return `\n## Review Sensitivity: Strict (${level}%)\n\nFlag: all security concerns, bugs, performance issues, anti-patterns, style inconsistencies, missing types. Be thorough but actionable.`;
  }
  return `\n## Review Sensitivity: Very Strict (${level}%)\n\nComprehensive review: all security concerns, bugs, edge cases, performance, anti-patterns, style, naming, types, documentation. Flag anything that could be improved.`;
}

function buildLocalReviewPrompt(files: FilePayload[], title: string, sensitivity: number): string {
  const sensitivitySection = getSensitivitySection(sensitivity);
  const filesChanged = files
    .map((f) => `- ${f.filename}${f.patch ? " (has diff)" : ""}`)
    .join("\n");
  const diffs = files
    .filter((f) => f.patch)
    .map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``)
    .join("\n\n");

  return `You are opendiff, a code reviewer specializing in identifying issues in pull requests.

Your job is to analyze code changes and provide constructive, actionable feedback.
${sensitivitySection}

## Review Context
**Title:** ${title}

## Files Changed
${filesChanged}

## Your Task

1. **Read each file** using the Read tool to understand the full context
2. **Analyze the diffs** provided below to understand what changed
3. **Investigate thoroughly** before flagging any issue - check patterns, conventions, and context
4. **Return your review** as valid JSON

## Diffs

${diffs}

## What to look for:

### Security Issues (type: "security")
- SQL injection, XSS, command injection
- Hardcoded secrets or credentials
- Insecure cryptography
- Missing input validation
- Authentication/authorization flaws

### Anti-patterns (type: "anti-pattern")
- God objects/classes, tight coupling, magic numbers/strings
- Copy-paste code, premature optimization

### Performance Issues (type: "performance")
- N+1 queries, missing indexes, unnecessary re-renders
- Memory leaks, blocking operations in async contexts

### Style Issues (type: "style")
- Inconsistent naming, missing error handling
- Poor variable names, overly complex functions

### Bug Risks (type: "bug-risk")
- Off-by-one errors, null pointer risks
- Race conditions, incorrect logic, unhandled edge cases

## Investigation Before Commenting

IMPORTANT: Before flagging any issue, you MUST investigate thoroughly:

1. **Understand the full context** - Use the Read tool to read the complete file, not just the diff.
2. **Check for patterns** - If you see something that looks wrong, use Grep to check if the same pattern is used elsewhere. It might be an established convention.
3. **Assume competence** - The developer likely had a reason for their approach. Only flag something if you're confident it's actually a problem.
4. **Avoid false positives** - It's better to miss a minor issue than to flag something that's actually correct.

## Line Number Accuracy

CRITICAL: The line number you report MUST exactly match the code you're commenting on.

1. **Verify before reporting** - Read the file and count lines to find the EXACT line number.
2. **When in doubt, omit** - If you cannot determine the exact line number, do NOT report the issue.

## Response Format

After your investigation, respond with ONLY valid JSON in this exact format (no other text):
{
  "summary": "Brief overall assessment",
  "issues": [
    {
      "type": "security|anti-pattern|performance|style|bug-risk",
      "severity": "critical|warning|suggestion",
      "file": "path/to/file.ts",
      "line": 42,
      "endLine": 45,
      "message": "short issue label (max ~60 chars)",
      "suggestion": "How to fix it",
      "suggestedCode": "const fixed = 'replacement code';"
    }
  ],
  "verdict": "approve|request_changes|comment"
}

### Field Explanations:
- **message**: A short, direct label for the issue (like a commit message subject line). Max ~60 characters.
- **line**: The starting line number of the issue
- **endLine**: (optional) The ending line number if the issue spans multiple lines
- **suggestion**: (optional) Text explanation of how to fix
- **suggestedCode**: (optional but PREFERRED) The exact replacement code.

## Guidelines

- Only flag issues you're genuinely confident about after investigation
- Be constructive, not harsh
- Focus on the most important issues
- Line numbers MUST be accurate
- **ALWAYS provide suggestedCode when you can offer a concrete fix**
- Use "approve" if code is good (minor suggestions OK)
- Use "request_changes" only for critical/security issues
- Use "comment" for moderate issues that should be addressed

Now, read the changed files and provide your review as JSON.`;
}

function parseLocalReviewResponse(text: string): ReviewResult {
  if (!text) {
    throw new Error("No response from review agent");
  }

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

  const result = JSON.parse(jsonText) as ReviewResult;
  if (!result.summary || !Array.isArray(result.issues) || !result.verdict) {
    throw new Error("Invalid response structure");
  }

  return result;
}

export async function runLocalReview(input: {
  files: FilePayload[];
  title: string;
  sensitivity: number;
  aiConfig?: AiRuntimeConfig | null;
}): Promise<{ review: ReviewResult; tokensUsed: number }> {
  const workingDir = mkdtempSync(`${tmpdir()}/opendiff-local-`);

  try {
    const realWorkingDir = realpathSync(workingDir);
    for (const file of input.files) {
      const filePath = resolve(realWorkingDir, file.filename);
      if (!filePath.startsWith(`${realWorkingDir}/`)) {
        throw new Error("Invalid filename");
      }
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content);
    }

    const prompt = buildLocalReviewPrompt(input.files, input.title, input.sensitivity);
    const response = await runOpencodePrompt({
      cwd: workingDir,
      prompt,
      mode: "read_only",
      aiConfig: input.aiConfig,
      title: "Local code review",
    });

    const review = parseLocalReviewResponse(response.text);
    return { review, tokensUsed: response.tokensUsed };
  } finally {
    rmSync(workingDir, { recursive: true, force: true });
  }
}
