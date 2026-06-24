import { createHash, randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";
import type { GitHubClient } from "../github/client";
import { withRetry } from "./retry";
import { cleanupUserSkills, hydrateSkills } from "./skill-hydrator";

/** Patterns that should never be committed by the bot */
const GIT_EXCLUDE_PATTERNS = ["core", "core.*", "*.core", ".claude/"];
const REF_META_DIR = "opendiff-ref-meta";
const LAST_USED_FILE = "opendiff-last-used";
const WORKTREE_META_FILE = ".opendiff-worktree.json";
const DEFAULT_FETCH_DEPTH = 1;
const DEFAULT_REPO_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REF_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WORKTREE_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_LOCK_STALE_MS = 30 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_REPOS = 100;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 * 1024;

interface CloneOptions {
  github: GitHubClient;
  owner: string;
  repo: string;
  branch: string;
  /** Optional head SHA used to detect branch drift for read-only review jobs. */
  commitSha?: string;
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

interface GitCacheConfig {
  disabled: boolean;
  rootDir: string;
  reposDir: string;
  worktreesDir: string;
  locksDir: string;
  fetchDepth: number;
  repoTtlMs: number;
  refTtlMs: number;
  worktreeTtlMs: number;
  lockStaleMs: number;
  cleanupIntervalMs: number;
  maxRepos: number;
  maxBytes: number;
}

interface RepoCachePaths {
  repoId: string;
  mirrorDir: string;
  lastUsedFile: string;
  worktreeDir: string;
  worktreeBranchName: string;
  worktreeBranchRef: string;
  branchRef: string;
  branchMetaFile: string;
}

interface CachedWorkspace {
  dir: string;
  git: SimpleGit;
}

interface RepoCacheEntry {
  repoId: string;
  path: string;
  lastUsedAt: number;
  sizeBytes: number;
}

export class CommitDriftError extends Error {
  constructor(
    readonly owner: string,
    readonly repo: string,
    readonly branch: string,
    readonly actualSha: string,
    readonly expectedSha: string
  ) {
    super(`Fetched ${owner}/${repo}@${branch} at ${actualSha}, expected ${expectedSha}`);
    this.name = "CommitDriftError";
  }
}

export function isCommitDriftError(error: unknown): error is CommitDriftError {
  return error instanceof CommitDriftError;
}

const repoLocks = new Map<string, Promise<void>>();
const activeWorktrees = new Set<string>();
let lastCleanupAt = 0;
let cleanupPromise: Promise<void> | null = null;

/**
 * Prepare a repo workspace, run a callback, then clean up.
 *
 * By default this uses a bounded bare-repo cache plus one ephemeral worktree per job:
 * - fetch the requested branch into a cached bare repo
 * - create a detached worktree for read-only jobs, or a checked-out branch for write jobs
 * - remove only the worktree when the job finishes
 * - opportunistically prune stale worktrees and inactive bare repos
 *
 * Set OPENDIFF_GIT_CACHE_DISABLED=true to fall back to the old fresh shallow clone behavior.
 *
 * Returns whatever the callback returns.
 */
export async function withClonedRepo<T>(
  opts: WithClonedRepoOptions,
  fn: (dir: string, git: SimpleGit) => Promise<T>
): Promise<T> {
  const { github, owner, repo } = opts;

  const token = await github.getInstallationToken();
  if (!token) {
    throw new Error("Could not get installation token for git operations");
  }

  const config = getGitCacheConfig();
  const workspace = config.disabled
    ? await prepareFreshClone(opts, token, config)
    : await prepareCachedWorktree(opts, token, config);

  try {
    if (opts.mode === "read-write") {
      await configureWriteWorkspace(workspace.git, opts.botUsername);
    }

    // Hydrate user skills into the workspace (fire-and-forget on failure)
    try {
      await hydrateSkills(owner, repo, workspace.dir);
    } catch (err) {
      console.warn("Skill hydration failed, continuing without skills:", err);
    }

    return await fn(workspace.dir, workspace.git);
  } finally {
    try {
      await cleanupUserSkills(workspace.dir);
    } catch {
      // Cleanup is best-effort
    }
    await cleanupWorkspace(workspace.dir, config);
  }
}

export async function pushHeadToBranch(git: Pick<SimpleGit, "raw">, branch: string): Promise<void> {
  await withRetry(
    () => git.raw(["push", "origin", `HEAD:refs/heads/${branch}`]),
    `git push origin HEAD:${branch}`
  );
}

export function getGitCacheConfig(env: NodeJS.ProcessEnv = process.env): GitCacheConfig {
  const rootDir = env.OPENDIFF_GIT_CACHE_DIR?.trim() || join(tmpdir(), "opendiff-git-cache");

  return {
    disabled: isTruthy(env.OPENDIFF_GIT_CACHE_DISABLED),
    rootDir,
    reposDir: join(rootDir, "repos"),
    worktreesDir: join(rootDir, "worktrees"),
    locksDir: join(rootDir, "locks"),
    fetchDepth: parsePositiveInteger(env.OPENDIFF_GIT_CACHE_FETCH_DEPTH, DEFAULT_FETCH_DEPTH),
    repoTtlMs: parseDurationMs(env.OPENDIFF_GIT_CACHE_REPO_TTL, DEFAULT_REPO_TTL_MS),
    refTtlMs: parseDurationMs(env.OPENDIFF_GIT_CACHE_REF_TTL, DEFAULT_REF_TTL_MS),
    worktreeTtlMs: parseDurationMs(env.OPENDIFF_GIT_CACHE_WORKTREE_TTL, DEFAULT_WORKTREE_TTL_MS),
    lockStaleMs: parseDurationMs(env.OPENDIFF_GIT_CACHE_LOCK_STALE_TTL, DEFAULT_LOCK_STALE_MS),
    cleanupIntervalMs: parseDurationMs(
      env.OPENDIFF_GIT_CACHE_CLEANUP_INTERVAL,
      DEFAULT_CLEANUP_INTERVAL_MS
    ),
    maxRepos: parseNonNegativeInteger(env.OPENDIFF_GIT_CACHE_MAX_REPOS, DEFAULT_MAX_REPOS),
    maxBytes: parseBytes(env.OPENDIFF_GIT_CACHE_MAX_BYTES, DEFAULT_MAX_BYTES),
  };
}

export async function pruneGitCache(config = getGitCacheConfig()): Promise<void> {
  if (config.disabled) {
    return;
  }

  await ensureCacheDirs(config);
  await pruneStaleLocks(config);
  await pruneStaleWorktrees(config);

  const repoEntries = await getRepoCacheEntries(config);
  for (const entry of repoEntries) {
    if (await hasActiveRepoLock(config, entry.repoId)) {
      continue;
    }
    await pruneCachedRefs(entry.path, config.refTtlMs);
    await pruneGitWorktreeMetadata(entry.path);
  }

  const now = Date.now();
  for (const entry of repoEntries) {
    if (await hasActiveRepoLock(config, entry.repoId)) {
      continue;
    }
    if (now - entry.lastUsedAt < config.repoTtlMs) {
      continue;
    }
    if (await hasLinkedWorktrees(entry.path)) {
      continue;
    }
    await removeRepoCache(entry.path, "inactive TTL");
  }

  await enforceRepoCacheLimits(config);
}

async function prepareCachedWorktree(
  opts: WithClonedRepoOptions,
  token: string,
  config: GitCacheConfig
): Promise<CachedWorkspace> {
  await ensureCacheDirs(config);
  await maybePruneGitCache(config);

  const paths = buildRepoCachePaths(opts, config);

  return await withRepoLock(config, paths.repoId, async () => {
    await ensureBareRepo(paths.mirrorDir);

    const repoUrl = getRepoUrl(opts.owner, opts.repo);
    const authEnv = await getGitAuthEnv(config, token);
    const bareGit = simpleGit(paths.mirrorDir).env(authEnv);

    await ensureOriginRemote(bareGit, repoUrl);
    await fetchBranch(bareGit, repoUrl, opts, paths, config);
    await mkdir(dirname(paths.worktreeDir), { recursive: true });
    let worktreeCreated = false;
    try {
      await withRetry(
        () =>
          opts.mode === "read-write"
            ? bareGit.raw([
                "worktree",
                "add",
                "--force",
                "-b",
                paths.worktreeBranchName,
                paths.worktreeDir,
                paths.branchRef,
              ])
            : bareGit.raw([
                "worktree",
                "add",
                "--force",
                "--detach",
                paths.worktreeDir,
                paths.branchRef,
              ]),
        `git worktree add ${opts.owner}/${opts.repo}`
      );
      worktreeCreated = true;
      await writeWorktreeMeta(
        paths.worktreeDir,
        paths.repoId,
        paths.mirrorDir,
        opts.mode === "read-write" ? paths.worktreeBranchRef : undefined
      );
      activeWorktrees.add(paths.worktreeDir);
      await touch(paths.lastUsedFile);
    } catch (error) {
      if (worktreeCreated) {
        await removeWorktreeFromMirror(bareGit, paths.worktreeDir);
        if (opts.mode === "read-write") {
          await deleteRefIfExists(bareGit, paths.worktreeBranchRef);
        }
      }
      throw error;
    }

    return {
      dir: paths.worktreeDir,
      git: simpleGit(paths.worktreeDir).env(authEnv),
    };
  });
}

async function prepareFreshClone(
  opts: WithClonedRepoOptions,
  token: string,
  config: GitCacheConfig
): Promise<CachedWorkspace> {
  const repoId = buildRepoId(opts.owner, opts.repo);
  const tempDir = join(
    tmpdir(),
    `${sanitizePathSegment(opts.label)}-${repoId}-${Date.now()}-${randomId()}`
  );
  const repoUrl = getRepoUrl(opts.owner, opts.repo);
  const git = simpleGit(tempDir).env(await getGitAuthEnv(config, token));

  await mkdir(tempDir, { recursive: true });
  await withRetry(
    () =>
      git.clone(repoUrl, ".", {
        "--branch": opts.branch,
        "--depth": String(config.fetchDepth),
        "--single-branch": null,
      }),
    "git clone"
  );

  await validateCommitSha(git, "HEAD", opts);

  return { dir: tempDir, git };
}

async function cleanupWorkspace(dir: string, config: GitCacheConfig): Promise<void> {
  activeWorktrees.delete(dir);

  if (!dir.startsWith(`${config.worktreesDir}/`)) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      console.warn(`Failed to cleanup temp directory: ${dir}`);
    }
    return;
  }

  try {
    const rawMeta = await readFile(join(dir, WORKTREE_META_FILE), "utf8");
    const meta = JSON.parse(rawMeta) as { mirrorDir?: unknown; worktreeBranchRef?: unknown };
    if (typeof meta.mirrorDir !== "string") {
      throw new Error("Worktree metadata is missing mirrorDir");
    }
    const git = simpleGit(meta.mirrorDir);
    await removeWorktreeFromMirror(git, dir);
    if (typeof meta.worktreeBranchRef === "string") {
      await deleteRefIfExists(git, meta.worktreeBranchRef);
    }
  } catch {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      console.warn(`Failed to cleanup worktree directory: ${dir}`);
    }
  }
}

async function removeWorktreeFromMirror(git: SimpleGit, worktreeDir: string): Promise<void> {
  try {
    await git.raw(["worktree", "remove", "--force", worktreeDir]);
  } catch {
    await rm(worktreeDir, { recursive: true, force: true });
    try {
      await git.raw(["worktree", "prune"]);
    } catch {
      // Worktree metadata cleanup is best-effort.
    }
  }
}

async function configureWriteWorkspace(git: SimpleGit, botUsername: string): Promise<void> {
  try {
    await git.raw(["config", "extensions.worktreeConfig", "true"]);
    await git.raw([
      "config",
      "--worktree",
      "user.email",
      `${botUsername}[bot]@users.noreply.github.com`,
    ]);
    await git.raw(["config", "--worktree", "user.name", `${botUsername}[bot]`]);
  } catch {
    await git.addConfig("user.email", `${botUsername}[bot]@users.noreply.github.com`);
    await git.addConfig("user.name", `${botUsername}[bot]`);
  }

  await ensureExcludePatterns(git);
}

async function ensureExcludePatterns(git: SimpleGit): Promise<void> {
  const excludePathRaw = (await git.raw(["rev-parse", "--git-path", "info/exclude"])).trim();
  const excludePath = isAbsolute(excludePathRaw)
    ? excludePathRaw
    : join((await git.revparse(["--show-toplevel"])).trim(), excludePathRaw);
  let existing = "";
  try {
    existing = await readFile(excludePath, "utf8");
  } catch {
    await mkdir(dirname(excludePath), { recursive: true });
  }

  const missingPatterns = GIT_EXCLUDE_PATTERNS.filter(
    (pattern) => !existing.split(/\r?\n/).includes(pattern)
  );
  if (missingPatterns.length > 0) {
    await appendFile(excludePath, `\n${missingPatterns.join("\n")}\n`);
  }
}

async function ensureCacheDirs(config: GitCacheConfig): Promise<void> {
  await mkdir(config.reposDir, { recursive: true });
  await mkdir(config.worktreesDir, { recursive: true });
  await mkdir(config.locksDir, { recursive: true });
}

function buildRepoCachePaths(opts: WithClonedRepoOptions, config: GitCacheConfig): RepoCachePaths {
  const repoId = buildRepoId(opts.owner, opts.repo);
  const branchId = hashString(opts.branch, 20);
  const worktreeId = [
    sanitizePathSegment(opts.label),
    repoId,
    branchId,
    String(Date.now()),
    randomId(),
  ].join("-");
  const mirrorDir = join(config.reposDir, `${repoId}.git`);
  const worktreeBranchName = `opendiff-write/${worktreeId}`;

  return {
    repoId,
    mirrorDir,
    lastUsedFile: join(mirrorDir, LAST_USED_FILE),
    worktreeDir: join(config.worktreesDir, worktreeId),
    worktreeBranchName,
    worktreeBranchRef: `refs/heads/${worktreeBranchName}`,
    branchRef: `refs/opendiff/heads/${branchId}`,
    branchMetaFile: join(mirrorDir, REF_META_DIR, `${branchId}.json`),
  };
}

function buildRepoId(owner: string, repo: string): string {
  const readable = `${sanitizePathSegment(owner)}-${sanitizePathSegment(repo)}`;
  return `${readable}-${hashString(`${owner}/${repo}`, 12)}`;
}

async function ensureBareRepo(mirrorDir: string): Promise<void> {
  if (await pathExists(join(mirrorDir, "HEAD"))) {
    try {
      const isBare = (await simpleGit(mirrorDir).raw(["rev-parse", "--is-bare-repository"])).trim();
      if (isBare === "true") {
        return;
      }
    } catch {
      // Fall through and rebuild a corrupt cache entry.
    }
    await rm(mirrorDir, { recursive: true, force: true });
  }

  await mkdir(dirname(mirrorDir), { recursive: true });
  await simpleGit().raw(["init", "--bare", mirrorDir]);
}

async function ensureOriginRemote(git: SimpleGit, repoUrl: string): Promise<void> {
  try {
    const currentUrl = (await git.raw(["remote", "get-url", "origin"])).trim();
    if (currentUrl !== repoUrl) {
      await git.raw(["remote", "set-url", "origin", repoUrl]);
    }
  } catch {
    await git.raw(["remote", "add", "origin", repoUrl]);
  }
}

async function fetchBranch(
  git: SimpleGit,
  repoUrl: string,
  opts: WithClonedRepoOptions,
  paths: RepoCachePaths,
  config: GitCacheConfig
): Promise<void> {
  await withRetry(
    () =>
      git.raw([
        "fetch",
        "--no-tags",
        "--force",
        "--depth",
        String(config.fetchDepth),
        repoUrl,
        `+refs/heads/${opts.branch}:${paths.branchRef}`,
      ]),
    `git fetch ${opts.owner}/${opts.repo}@${opts.branch}`
  );

  await validateCommitSha(git, paths.branchRef, opts);

  await mkdir(dirname(paths.branchMetaFile), { recursive: true });
  await writeFile(
    paths.branchMetaFile,
    `${JSON.stringify(
      {
        branch: opts.branch,
        ref: paths.branchRef,
        lastUsedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );
}

async function validateCommitSha(
  git: SimpleGit,
  ref: string,
  opts: WithClonedRepoOptions
): Promise<void> {
  if (!opts.commitSha) {
    return;
  }

  const resolvedSha = (await git.raw(["rev-parse", ref])).trim();
  if (resolvedSha !== opts.commitSha) {
    throw new CommitDriftError(opts.owner, opts.repo, opts.branch, resolvedSha, opts.commitSha);
  }
}

async function writeWorktreeMeta(
  worktreeDir: string,
  repoId: string,
  mirrorDir: string,
  worktreeBranchRef?: string
): Promise<void> {
  await writeFile(
    join(worktreeDir, WORKTREE_META_FILE),
    `${JSON.stringify(
      {
        repoId,
        mirrorDir,
        worktreeBranchRef,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );
}

async function maybePruneGitCache(config: GitCacheConfig): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < config.cleanupIntervalMs) {
    return;
  }
  lastCleanupAt = now;

  cleanupPromise ??= pruneGitCache(config)
    .catch((error) => {
      console.warn("Git cache cleanup failed:", error);
    })
    .finally(() => {
      cleanupPromise = null;
    });

  await cleanupPromise;
}

async function pruneStaleLocks(config: GitCacheConfig): Promise<void> {
  const entries = await safeReadDir(config.locksDir);
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const lockDir = join(config.locksDir, entry.name);
    const ageMs = now - (await getPathMtimeMs(lockDir));
    if (ageMs > config.lockStaleMs) {
      await rm(lockDir, { recursive: true, force: true });
    }
  }
}

async function pruneStaleWorktrees(config: GitCacheConfig): Promise<void> {
  const entries = await safeReadDir(config.worktreesDir);
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const worktreeDir = join(config.worktreesDir, entry.name);
    if (activeWorktrees.has(worktreeDir)) {
      continue;
    }

    const ageMs = now - (await getPathMtimeMs(join(worktreeDir, WORKTREE_META_FILE), worktreeDir));
    if (ageMs <= config.worktreeTtlMs) {
      continue;
    }

    await cleanupWorkspace(worktreeDir, config);
  }
}

async function getRepoCacheEntries(config: GitCacheConfig): Promise<RepoCacheEntry[]> {
  const entries = await safeReadDir(config.reposDir);
  const repos: RepoCacheEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".git")) {
      continue;
    }

    const repoPath = join(config.reposDir, entry.name);
    repos.push({
      repoId: entry.name.slice(0, -".git".length),
      path: repoPath,
      lastUsedAt: await getPathMtimeMs(join(repoPath, LAST_USED_FILE), repoPath),
      sizeBytes: 0,
    });
  }

  return repos;
}

async function pruneCachedRefs(mirrorDir: string, refTtlMs: number): Promise<void> {
  const metaDir = join(mirrorDir, REF_META_DIR);
  const entries = await safeReadDir(metaDir);
  const git = simpleGit(mirrorDir);
  const now = Date.now();
  let pruned = false;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const metaPath = join(metaDir, entry.name);
    if (now - (await getPathMtimeMs(metaPath)) <= refTtlMs) {
      continue;
    }

    try {
      const raw = await readFile(metaPath, "utf8");
      const parsed = JSON.parse(raw) as { ref?: unknown };
      if (typeof parsed.ref === "string" && parsed.ref.startsWith("refs/opendiff/heads/")) {
        await git.raw(["update-ref", "-d", parsed.ref]);
      }
    } catch {
      // Remove bad metadata below.
    }
    await rm(metaPath, { force: true });
    pruned = true;
  }

  if (pruned) {
    try {
      await git.raw(["gc", "--auto"]);
    } catch {
      // GC is opportunistic.
    }
  }
}

async function deleteRefIfExists(git: SimpleGit, ref: string): Promise<void> {
  try {
    await git.raw(["update-ref", "-d", ref]);
  } catch {
    // Ref cleanup is best-effort.
  }
}

async function pruneGitWorktreeMetadata(mirrorDir: string): Promise<void> {
  try {
    await simpleGit(mirrorDir).raw(["worktree", "prune"]);
  } catch {
    // A corrupt cache entry will be rebuilt by ensureBareRepo on next use.
  }
}

async function enforceRepoCacheLimits(config: GitCacheConfig): Promise<void> {
  let entries = await getRepoCacheEntries(config);
  entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  if (config.maxRepos > 0) {
    let reposToRemove = entries.length - config.maxRepos;
    for (const entry of entries) {
      if (reposToRemove <= 0) {
        break;
      }
      if (await hasActiveRepoLock(config, entry.repoId)) {
        continue;
      }
      if (await hasLinkedWorktrees(entry.path)) {
        continue;
      }
      await removeRepoCache(entry.path, "max repo count");
      reposToRemove -= 1;
    }
  }

  if (config.maxBytes === 0) {
    return;
  }

  entries = await getRepoCacheEntries(config);
  for (const entry of entries) {
    entry.sizeBytes = await getDirectorySize(entry.path);
  }
  entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  let totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  for (const entry of entries) {
    if (totalBytes <= config.maxBytes) {
      break;
    }
    if (await hasActiveRepoLock(config, entry.repoId)) {
      continue;
    }
    if (await hasLinkedWorktrees(entry.path)) {
      continue;
    }
    await removeRepoCache(entry.path, "max cache size");
    totalBytes -= entry.sizeBytes;
  }
}

async function removeRepoCache(repoPath: string, reason: string): Promise<void> {
  console.log(`Removing git cache repo ${repoPath} (${reason})`);
  await rm(repoPath, { recursive: true, force: true });
}

async function hasActiveRepoLock(config: GitCacheConfig, repoId: string): Promise<boolean> {
  return await pathExists(join(config.locksDir, `${repoId}.lock`));
}

async function hasLinkedWorktrees(mirrorDir: string): Promise<boolean> {
  try {
    const output = await simpleGit(mirrorDir).raw(["worktree", "list", "--porcelain"]);
    const worktrees = output
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length).trim());
    for (const worktree of worktrees) {
      if (worktree === mirrorDir) {
        continue;
      }
      if (activeWorktrees.has(worktree) || (await pathExists(worktree))) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function withRepoLock<T>(
  config: GitCacheConfig,
  repoId: string,
  fn: () => Promise<T>
): Promise<T> {
  return await withInProcessRepoLock(repoId, async () => {
    await mkdir(config.locksDir, { recursive: true });
    const lockDir = join(config.locksDir, `${repoId}.lock`);

    while (true) {
      try {
        await mkdir(lockDir);
        await writeFile(
          join(lockDir, "owner.json"),
          `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`
        );
        break;
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
          throw error;
        }

        const ageMs = Date.now() - (await getPathMtimeMs(lockDir));
        if (ageMs > config.lockStaleMs) {
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }

        await delay(100 + Math.floor(Math.random() * 200));
      }
    }

    try {
      return await fn();
    } finally {
      await rm(lockDir, { recursive: true, force: true });
    }
  });
}

async function withInProcessRepoLock<T>(repoId: string, fn: () => Promise<T>): Promise<T> {
  const previous = repoLocks.get(repoId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  repoLocks.set(repoId, tail);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (repoLocks.get(repoId) === tail) {
      repoLocks.delete(repoId);
    }
  }
}

async function getGitAuthEnv(
  config: GitCacheConfig,
  token: string
): Promise<Record<string, string>> {
  const askPassPath = await ensureAskPassScript(config.rootDir);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }

  return {
    ...env,
    GIT_ASKPASS: askPassPath,
    GIT_TERMINAL_PROMPT: "0",
    OPENDIFF_GIT_TOKEN: token,
  };
}

async function ensureAskPassScript(rootDir: string): Promise<string> {
  const binDir = join(rootDir, "bin");
  const scriptPath = join(binDir, "git-askpass.sh");
  const script = [
    "#!/bin/sh",
    'case "$1" in',
    '  *Username*) printf "%s\\n" "x-access-token" ;;',
    '  *) printf "%s\\n" "$OPENDIFF_GIT_TOKEN" ;;',
    "esac",
    "",
  ].join("\n");

  await mkdir(binDir, { recursive: true });
  await writeFile(scriptPath, script, { mode: 0o700 });
  await chmod(scriptPath, 0o700);
  return scriptPath;
}

function getRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (sanitized || "repo").slice(0, 64);
}

function hashString(value: string, length: number): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function randomId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

async function touch(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${new Date().toISOString()}\n`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function safeReadDir(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function getPathMtimeMs(path: string, fallbackPath?: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    if (fallbackPath) {
      return await getPathMtimeMs(fallbackPath);
    }
    return 0;
  }
}

async function getDirectorySize(path: string): Promise<number> {
  let total = 0;
  const entries = await safeReadDir(path);
  for (const entry of entries) {
    const childPath = join(path, entry.name);
    try {
      if (entry.isDirectory()) {
        total += await getDirectorySize(childPath);
      } else if (entry.isFile()) {
        total += (await stat(childPath)).size;
      }
    } catch {
      // Ignore files that disappear during cleanup.
    }
  }
  return total;
}

function parseDurationMs(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/);
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    return fallback;
  }

  const unit = match[2] ?? "ms";
  const multiplier =
    unit === "d"
      ? 24 * 60 * 60 * 1000
      : unit === "h"
        ? 60 * 60 * 1000
        : unit === "m"
          ? 60 * 1000
          : unit === "s"
            ? 1000
            : 1;

  return Math.floor(amount * multiplier);
}

function parseBytes(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb|tb)?$/);
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    return fallback;
  }

  const unit = match[2] ?? "b";
  const multiplier =
    unit === "tb"
      ? 1024 ** 4
      : unit === "gb"
        ? 1024 ** 3
        : unit === "mb"
          ? 1024 ** 2
          : unit === "kb"
            ? 1024
            : 1;

  return Math.floor(amount * multiplier);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
