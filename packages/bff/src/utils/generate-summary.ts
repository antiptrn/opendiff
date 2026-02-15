import { mkdir, rm } from "node:fs/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKAssistantMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { loadPrompt } from "@opendiff/prompts";
import simpleGit from "simple-git";
import { getInstallationTokenForRepo } from "./github-metadata";

function buildClaudeAgentEnv(): Record<string, string> {
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      if (authToken && key === "ANTHROPIC_API_KEY") {
        continue;
      }
      env[key] = value;
    }
  }

  if (authToken) {
    env.ANTHROPIC_AUTH_TOKEN = authToken;
  }

  return env;
}

interface ReviewCommentInput {
  body: string;
  path: string | null;
  line: number | null;
  fixStatus: string | null;
}

interface PRFileDiff {
  filename: string;
  patch?: string;
}

export interface GenerateSummaryInput {
  owner: string;
  repo: string;
  pullNumber: number;
  headBranch: string;
  pullTitle: string | null;
  pullBody: string | null;
  pullAuthor: string | null;
  baseBranch: string | null;
  comments: ReviewCommentInput[];
}

async function fetchPRFiles(
  owner: string,
  repo: string,
  pullNumber: number,
  token: string
): Promise<PRFileDiff[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (!res.ok) return [];
  const files = (await res.json()) as Array<{ filename: string; patch?: string }>;
  return files.map((f) => ({ filename: f.filename, patch: f.patch }));
}

export interface GenerateSummaryResult {
  summary: string;
  fileTitles: Record<string, string>;
}

export async function generateReviewSummary(
  input: GenerateSummaryInput
): Promise<GenerateSummaryResult> {
  const token = await getInstallationTokenForRepo(input.owner, input.repo);
  if (!token) {
    throw new Error(`Could not get installation token for ${input.owner}/${input.repo}`);
  }

  // Fetch PR file diffs
  const files = await fetchPRFiles(input.owner, input.repo, input.pullNumber, token);

  // Clone repo to temp directory
  const tempDir = `/tmp/summary-${input.owner}-${input.repo}-${input.pullNumber}-${Date.now()}`;
  await mkdir(tempDir, { recursive: true });

  try {
    const cloneUrl = `https://x-access-token:${token}@github.com/${input.owner}/${input.repo}.git`;
    let cloneSucceeded = false;
    try {
      const git = simpleGit(tempDir);
      await git.clone(cloneUrl, ".", [
        "--branch",
        input.headBranch,
        "--depth",
        "1",
        "--single-branch",
      ]);
      cloneSucceeded = true;
    } catch (err) {
      console.warn(
        `Clone failed for ${input.owner}/${input.repo}@${input.headBranch}, proceeding with diffs only:`,
        err
      );
    }

    // Build template variables
    const commentsList = input.comments
      .map((c, i) => {
        const parts = [`Comment ${i + 1}: ${c.body}`];
        if (c.path) parts.push(`  File: ${c.path}${c.line != null ? `:${c.line}` : ""}`);
        if (c.fixStatus) parts.push(`  Fix status: ${c.fixStatus}`);
        return parts.join("\n");
      })
      .join("\n\n");

    const diffSection = files
      .filter((f) => f.patch)
      .map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``)
      .join("\n\n");

    const prompt = loadPrompt("generate-summary", {
      cloneContext: cloneSucceeded
        ? " You have access to the full repository to understand context."
        : "",
      pullTitle: input.pullTitle ?? "Unknown",
      pullAuthor: input.pullAuthor ?? "Unknown",
      headBranch: input.headBranch,
      baseBranch: input.baseBranch ?? "?",
      pullBodySection: input.pullBody ? `\n**Description:**\n${input.pullBody}\n` : "",
      filesChanged: files.map((f) => `- ${f.filename}`).join("\n"),
      diffSection,
      commentCount: String(input.comments.length),
      commentsList,
      readInstruction: cloneSucceeded
        ? "Read the changed files using the Read tool to understand the full context of the changes"
        : "Use the diffs provided above to understand the changes",
    });

    let result = "";
    let lastAssistantText = "";

    try {
      for await (const message of query({
        prompt,
        options: {
          cwd: tempDir,
          env: buildClaudeAgentEnv(),
          allowedTools: cloneSucceeded ? ["Read", "Glob", "Grep"] : [],
          permissionMode: "default",
          maxTurns: cloneSucceeded ? 10 : 1,
          settingSources: ["user"],
        },
      })) {
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
            result = resultMsg.result || lastAssistantText || "";
          } else {
            throw new Error(resultMsg.errors?.join(", ") || "Summary agent failed");
          }
        }
      }
    } catch (error) {
      // SDK has a known bug where stream cleanup fails with "line.trim" error
      if (
        (result || lastAssistantText) &&
        error instanceof TypeError &&
        String(error).includes("trim")
      ) {
        console.warn("Ignoring SDK stream cleanup error");
        if (!result) result = lastAssistantText;
      } else {
        throw error;
      }
    }

    if (!result) {
      throw new Error("Summary agent returned no result");
    }

    // Parse structured JSON response
    try {
      // Strip markdown code fences if present
      const cleaned = result
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (
        typeof parsed.summary === "string" &&
        typeof parsed.fileTitles === "object" &&
        parsed.fileTitles !== null
      ) {
        return { summary: parsed.summary, fileTitles: parsed.fileTitles as Record<string, string> };
      }
    } catch {
      // JSON parsing failed — fall through to fallback
    }

    // Fallback: treat raw text as summary, no file titles
    return { summary: result, fileTitles: {} };
  } finally {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      console.warn(`Failed to cleanup temp directory: ${tempDir}`);
    }
  }
}
