import { describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { GitHubClient } from "../github/client";
import {
  CommitDriftError,
  getGitCacheConfig,
  isCommitDriftError,
  pruneGitCache,
  withClonedRepo,
} from "./git";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function markOld(path: string): Promise<void> {
  const old = new Date(Date.now() - 60 * 60 * 1000);
  await utimes(path, old, old);
}

async function createFakeRepo(config: ReturnType<typeof getGitCacheConfig>, name: string) {
  const repoPath = join(config.reposDir, `${name}.git`);
  const lastUsedPath = join(repoPath, "opendiff-last-used");

  await mkdir(repoPath, { recursive: true });
  await writeFile(join(repoPath, "HEAD"), "ref: refs/heads/main\n");
  await writeFile(lastUsedPath, "old\n");
  await markOld(lastUsedPath);
  await markOld(repoPath);

  return repoPath;
}

describe("git cache config", () => {
  it("parses duration, byte, and limit settings", () => {
    const config = getGitCacheConfig({
      OPENDIFF_GIT_CACHE_DIR: "/tmp/opendiff-test-cache",
      OPENDIFF_GIT_CACHE_REPO_TTL: "2h",
      OPENDIFF_GIT_CACHE_WORKTREE_TTL: "30m",
      OPENDIFF_GIT_CACHE_MAX_REPOS: "7",
      OPENDIFF_GIT_CACHE_MAX_BYTES: "2gb",
    });

    expect(config.repoTtlMs).toBe(2 * 60 * 60 * 1000);
    expect(config.worktreeTtlMs).toBe(30 * 60 * 1000);
    expect(config.maxRepos).toBe(7);
    expect(config.maxBytes).toBe(2 * 1024 * 1024 * 1024);
  });
});

describe("pruneGitCache", () => {
  it("removes stale worktrees and inactive bare repos", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opendiff-git-cache-test-"));
    const config = {
      ...getGitCacheConfig({ OPENDIFF_GIT_CACHE_DIR: rootDir }),
      repoTtlMs: 1,
      refTtlMs: 1,
      worktreeTtlMs: 1,
      maxRepos: 100,
      maxBytes: 0,
    };

    try {
      const repoPath = await createFakeRepo(config, "old-repo");
      const worktreePath = join(config.worktreesDir, "stale-worktree");
      const worktreeMetaPath = join(worktreePath, ".opendiff-worktree.json");

      await mkdir(worktreePath, { recursive: true });
      await writeFile(worktreeMetaPath, "{}\n");
      await markOld(worktreeMetaPath);
      await markOld(worktreePath);

      await pruneGitCache(config);

      expect(await exists(worktreePath)).toBe(false);
      expect(await exists(repoPath)).toBe(false);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("enforces the max repo count by evicting least recently used repos", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opendiff-git-cache-test-"));
    const config = {
      ...getGitCacheConfig({ OPENDIFF_GIT_CACHE_DIR: rootDir }),
      repoTtlMs: 24 * 60 * 60 * 1000,
      maxRepos: 1,
      maxBytes: 0,
    };

    try {
      const oldRepoPath = await createFakeRepo(config, "old-repo");
      const newRepoPath = await createFakeRepo(config, "new-repo");
      await writeFile(join(newRepoPath, "opendiff-last-used"), "new\n");

      await pruneGitCache(config);

      expect(await exists(oldRepoPath)).toBe(false);
      expect(await exists(newRepoPath)).toBe(true);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe("isCommitDriftError", () => {
  it("identifies commit drift as a dedicated stale-job error", () => {
    expect(
      isCommitDriftError(
        new CommitDriftError("owner", "repo", "main", "actual-sha", "expected-sha")
      )
    ).toBe(true);
    expect(isCommitDriftError(new Error("other"))).toBe(false);
  });
});

describe("cached worktree configuration", () => {
  it("keeps the cache bare and linked write/read worktrees usable across cache reuse", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opendiff-worktree-config-test-"));
    const previousEnv = { ...process.env };
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ skills: [] })
    );

    try {
      const sourceDir = join(rootDir, "source");
      await mkdir(sourceDir);
      const sourceGit = simpleGit(sourceDir);
      await sourceGit.raw(["init", "--initial-branch=main"]);
      await sourceGit.addConfig("user.name", "Test");
      await sourceGit.addConfig("user.email", "test@example.com");
      await writeFile(join(sourceDir, "example.txt"), "before\n");
      await sourceGit.add("example.txt");
      await sourceGit.commit("Initial commit");

      // Redirect the production fetch URL to a real local repository.
      const globalConfig = join(rootDir, "gitconfig");
      await sourceGit.raw([
        "config",
        "--file",
        globalConfig,
        `url.${sourceDir}.insteadOf`,
        "https://github.com/worktree-test/repo.git",
      ]);
      process.env.GIT_CONFIG_GLOBAL = globalConfig;
      process.env.OPENDIFF_GIT_CACHE_DIR = join(rootDir, "cache");
      process.env.OPENDIFF_GIT_CACHE_DISABLED = "false";

      const github = {
        getInstallationToken: async () => "test-token",
      } as unknown as GitHubClient;
      let mirrorDir = "";
      for (const mode of ["read-write", "read-write", "read-only"] as const) {
        let workspaceDir = "";
        await withClonedRepo(
          {
            github,
            owner: "worktree-test",
            repo: "repo",
            branch: "main",
            label: "test",
            mode,
            botUsername: "test-bot",
          },
          async (dir, git) => {
            workspaceDir = dir;
            mirrorDir = (await git.raw(["rev-parse", "--git-common-dir"])).trim();
            expect((await git.raw(["rev-parse", "--is-bare-repository"])).trim()).toBe("false");
            expect((await git.revparse(["--show-toplevel"])).trim()).toBe(await realpath(dir));
            expect((await git.status()).isClean()).toBe(true);
            if (mode === "read-write") {
              expect((await git.getConfig("user.name", "worktree")).value).toBe("test-bot[bot]");
              const patchPath = join(rootDir, "change.patch");
              await writeFile(
                patchPath,
                "diff --git a/example.txt b/example.txt\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-before\n+after\n"
              );
              await git.raw(["apply", patchPath]);
              await git.add("example.txt");
              expect((await git.status()).staged).toContain("example.txt");
            }
          }
        );
        expect(await exists(workspaceDir)).toBe(false);
        const bareGit = simpleGit(mirrorDir);
        expect((await bareGit.raw(["rev-parse", "--is-bare-repository"])).trim()).toBe("true");
        expect((await bareGit.getConfig("core.bare", "local")).value).toBeNull();
        expect((await bareGit.getConfig("core.bare", "worktree")).value).toBe("true");
        expect(await bareGit.raw(["for-each-ref", "refs/heads/opendiff-write/"])).toBe("");

        if (mode === "read-write") {
          // Reproduce a cache persisted by the old implementation, so the next
          // job must repair an already-enabled extension as well as a new repo.
          await bareGit.raw(["config", "--local", "core.bare", "true"]);
          await bareGit.raw(["config", "--worktree", "--unset-all", "core.bare"]);
        }
      }
    } finally {
      fetchSpy.mockRestore();
      for (const key of [
        "GIT_CONFIG_GLOBAL",
        "OPENDIFF_GIT_CACHE_DIR",
        "OPENDIFF_GIT_CACHE_DISABLED",
      ]) {
        if (previousEnv[key] === undefined) delete process.env[key];
        else process.env[key] = previousEnv[key];
      }
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
