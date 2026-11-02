import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { SimpleGit } from "simple-git";
import type { PullRequest, PullRequestFile } from "../github/types";

function assertCommitSha(sha: string): void {
  if (!/^[a-f0-9]{40,64}$/i.test(sha)) {
    throw new Error("Review snapshot requires an exact commit SHA");
  }
}

async function ensureCommit(git: SimpleGit, sha: string): Promise<void> {
  assertCommitSha(sha);
  try {
    await git.raw(["rev-parse", "--verify", `${sha}^{commit}`]);
  } catch {
    await git.raw(["fetch", "--depth=1", "origin", sha]);
    await git.raw(["rev-parse", "--verify", `${sha}^{commit}`]);
  }
}

export async function checkoutReviewCommit(git: SimpleGit, sha: string): Promise<void> {
  await ensureCommit(git, sha);
  await git.raw(["checkout", "--detach", sha]);
  if ((await git.revparse(["HEAD"])).trim().toLowerCase() !== sha.toLowerCase()) {
    throw new Error("Review checkout does not match the requested commit");
  }
}

async function findMergeBase(git: SimpleGit, base: string, head: string): Promise<string> {
  for (const deepen of [0, 100, 500, 2000]) {
    if (deepen > 0) {
      const shallow = (await git.raw(["rev-parse", "--is-shallow-repository"])).trim();
      if (shallow !== "true") break;
      await git.raw(["fetch", `--deepen=${deepen}`, "origin", base, head]);
    }
    try {
      const mergeBase = (await git.raw(["merge-base", base, head])).trim();
      if (mergeBase) return mergeBase;
    } catch {
      // A shallow boundary may hide the common ancestor; fetch more ancestry.
    }
  }

  if ((await git.raw(["rev-parse", "--is-shallow-repository"])).trim() === "true") {
    await git.raw(["fetch", "--unshallow", "origin", base, head]);
  }
  const mergeBase = (await git.raw(["merge-base", base, head])).trim();
  if (!mergeBase) throw new Error("Could not determine the PR merge base");
  return mergeBase;
}

function safeSnapshotPath(directory: string, filename: string): string {
  if (!filename || isAbsolute(filename) || filename.includes("\\") || filename.includes("\0")) {
    throw new Error("Invalid path in review snapshot");
  }
  const result = resolve(directory, filename);
  const local = relative(directory, result);
  if (!local || local === ".." || local.startsWith("../") || isAbsolute(local)) {
    throw new Error("Invalid path in review snapshot");
  }
  return result;
}

function parseChangedFiles(output: string): PullRequestFile[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const files: PullRequestFile[] = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    const firstPath = fields[index++];
    const isRename = status?.startsWith("R") || status?.startsWith("C");
    const filename = isRename ? fields[index++] : firstPath;
    if (!filename || !firstPath)
      throw new Error("Invalid changed-file metadata in review snapshot");
    const statusName: PullRequestFile["status"] | undefined = {
      A: "added",
      D: "removed",
      M: "modified",
      T: "modified",
      R: "renamed",
      C: "copied",
    }[status[0]] as PullRequestFile["status"] | undefined;
    if (!statusName) throw new Error("Unsupported file status in review snapshot");
    files.push({
      filename,
      ...(isRename ? { previousFilename: firstPath } : {}),
      status: statusName,
      additions: 0,
      deletions: 0,
    });
  }
  return files;
}

/** Build the review diff and baseline from the same immutable PR revisions. */
export async function prepareReviewSnapshot(
  workingDir: string,
  git: SimpleGit,
  pullRequest: Pick<PullRequest, "head" | "base">
): Promise<{ files: PullRequestFile[]; baseDirectory: string }> {
  await checkoutReviewCommit(git, pullRequest.head.sha);
  await ensureCommit(git, pullRequest.base.sha);
  const mergeBase = await findMergeBase(git, pullRequest.base.sha, pullRequest.head.sha);
  const files = parseChangedFiles(
    await git.raw([
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--name-status",
      "-z",
      "--find-renames",
      mergeBase,
      pullRequest.head.sha,
      "--",
    ])
  );
  const baseDirectory = await mkdtemp(join(workingDir, ".opendiff-base-"));

  for (const file of files) {
    safeSnapshotPath(baseDirectory, file.filename);
    const basePath = file.previousFilename ?? file.filename;
    const snapshotPath = safeSnapshotPath(baseDirectory, basePath);
    const patch = await git.raw([
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--no-color",
      "--unified=3",
      "--find-renames",
      mergeBase,
      pullRequest.head.sha,
      "--",
      ...[...new Set([basePath, file.filename])].map((path) => `:(literal)${path}`),
    ]);
    if (/^@@ /m.test(patch) || file.status === "renamed") {
      file.patch = patch;
      let inHunk = false;
      for (const line of patch.split("\n")) {
        if (line.startsWith("@@ ")) inHunk = true;
        else if (line.startsWith("diff --git ")) inHunk = false;
        else if (inHunk && line.startsWith("+")) file.additions++;
        else if (inHunk && line.startsWith("-")) file.deletions++;
      }
    }
    // A pure rename still needs its original contents to verify path-dependent regressions.
    if (file.patch && file.status !== "added") {
      const entry = await git.raw([
        "--literal-pathspecs",
        "ls-tree",
        "-z",
        mergeBase,
        "--",
        basePath,
      ]);
      // Gitlinks reference submodule commits, which need not exist in this clone.
      if (!/^[0-7]{6} blob /.test(entry)) continue;
      const content = await git.raw(["show", `${mergeBase}:${basePath}`]);
      await mkdir(dirname(snapshotPath), { recursive: true });
      await writeFile(snapshotPath, content);
    }
  }
  return { files, baseDirectory };
}
