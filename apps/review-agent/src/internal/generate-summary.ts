import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPrompt } from "@opendiff/prompts";
import type { GitHubClient } from "../github/client";
import { withClonedRepo } from "../utils/git";
import type { AiRuntimeConfig } from "../utils/opencode";
import { runOpencodePrompt } from "../utils/opencode";

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

export interface GenerateSummaryResult {
  summary: string;
  fileTitles: Record<string, string>;
}

async function fetchPRFiles(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PRFileDiff[]> {
  try {
    const files = await github.getPullRequestFiles(owner, repo, pullNumber);
    return files.map((f) => ({ filename: f.filename, patch: f.patch }));
  } catch {
    return [];
  }
}

export async function generateReviewSummary(
  input: GenerateSummaryInput,
  github: GitHubClient,
  aiConfig?: AiRuntimeConfig | null
): Promise<GenerateSummaryResult> {
  const files = await fetchPRFiles(github, input.owner, input.repo, input.pullNumber);

  const runSummary = async (cwd: string, cloneSucceeded: boolean) => {
    const commentsList = input.comments
      .map((c, i) => {
        const parts = [`Comment ${i + 1}: ${c.body}`];
        if (c.path) {
          parts.push(`  File: ${c.path}${c.line != null ? `:${c.line}` : ""}`);
        }
        if (c.fixStatus) {
          parts.push(`  Fix status: ${c.fixStatus}`);
        }
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

    const result = (
      await runOpencodePrompt({
        cwd,
        prompt,
        mode: cloneSucceeded ? "read_only" : "no_tools",
        aiConfig,
        title: "Generate review summary",
      })
    ).text;

    if (!result) {
      throw new Error("Summary agent returned no result");
    }

    try {
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
      // fall through to raw text fallback
    }

    return { summary: result, fileTitles: {} };
  };

  try {
    return await withClonedRepo(
      {
        mode: "read-only",
        github,
        owner: input.owner,
        repo: input.repo,
        branch: input.headBranch,
        label: `summary-${input.pullNumber}`,
      },
      async (tempDir) => runSummary(tempDir, true)
    );
  } catch (err) {
    console.warn(
      `Workspace setup failed for ${input.owner}/${input.repo}@${input.headBranch}, proceeding with diffs only:`,
      err
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), "opendiff-summary-"));
  try {
    return await runSummary(tempDir, false);
  } finally {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      console.warn(`Failed to cleanup temp directory: ${tempDir}`);
    }
  }
}
