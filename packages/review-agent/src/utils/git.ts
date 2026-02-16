import { appendFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";
import type { GitHubClient } from "../github/client";
import { withRetry } from "./retry";
import { cleanupUserSkills, hydrateSkills } from "./skill-hydrator";

/** Patterns that should never be committed by the bot */
const GIT_EXCLUDE_PATTERNS = ["core", "core.*", "*.core", ".claude/"];

interface CloneOptions {
  github: GitHubClient;
  owner: string;
  repo: string;
  branch: string;
  /** Label used in the temp directory name (e.g. "review", "triage") */
  label: string;
}

interface ReadOnlyCloneOptions extends CloneOptions {
  mode: "read-only";
}

interface ReadWriteCloneOptions extends CloneOptions {
  mode: "read-write";
  botUsername: string;
}

type WithClonedRepoOptions = ReadOnlyCloneOptions | ReadWriteCloneOptions;

/**
 * Clone a repo into a temp directory, run a callback, then clean up.
 *
 * - **read-only**: shallow clone only (for reviews / comment responses)
 * - **read-write**: shallow clone + git user config (for triage / fix-accepted)
 *
 * Returns whatever the callback returns.
 */
export async function withClonedRepo<T>(
  opts: WithClonedRepoOptions,
  fn: (dir: string, git: SimpleGit) => Promise<T>
): Promise<T> {
  const { github, owner, repo, branch, label } = opts;

  const token = await github.getInstallationToken();
  if (!token) {
    throw new Error("Could not get installation token for git operations");
  }

  const tempDir = `/tmp/${label}-${owner}-${repo}-${Date.now()}`;

  try {
    await mkdir(tempDir, { recursive: true });

    const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    const git = simpleGit(tempDir);

    await withRetry(
      () =>
        git.clone(cloneUrl, ".", {
          "--branch": branch,
          "--depth": "1",
          "--single-branch": null,
        }),
      "git clone"
    );

    if (opts.mode === "read-write") {
      await git.addConfig("user.email", `${opts.botUsername}[bot]@users.noreply.github.com`);
      await git.addConfig("user.name", `${opts.botUsername}[bot]`);

      // Exclude core dumps and other junk from git add
      const excludeFile = join(tempDir, ".git", "info", "exclude");
      await appendFile(excludeFile, `\n${GIT_EXCLUDE_PATTERNS.join("\n")}\n`);
    }

    // Hydrate user skills into the workspace (fire-and-forget on failure)
    try {
      await hydrateSkills(owner, repo, tempDir);
    } catch (err) {
      console.warn("Skill hydration failed, continuing without skills:", err);
    }

    return await fn(tempDir, git);
  } finally {
    try {
      await cleanupUserSkills(tempDir);
    } catch {
      // Cleanup is best-effort
    }
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      console.warn(`Failed to cleanup temp directory: ${tempDir}`);
    }
  }
}
