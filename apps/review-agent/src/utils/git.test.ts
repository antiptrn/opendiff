import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGitCacheConfig, pruneGitCache } from "./git";

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
