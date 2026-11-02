import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FilePayload } from "../types";

export type DiffScope = "working" | "branch";

export function getDiffFiles(cwd: string, scope: DiffScope, baseBranch: string): FilePayload[] {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
  // Resolve branch refs once so metadata, patches, and content use the same revisions.
  const head =
    scope === "branch"
      ? git(["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"]).trim()
      : null;
  const revisions = head
    ? [
        `${git(["rev-parse", "--verify", "--end-of-options", `${baseBranch}^{commit}`]).trim()}...${head}`,
      ]
    : [];
  const diffOptions = [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--submodule=short",
    "--find-renames",
  ];
  const fields = git([...diffOptions, "--name-status", "-z", ...revisions, "--"]).split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length === 0) return [];

  const files: Array<FilePayload & { patchCount: number }> = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    const originalPath = fields[index++];
    const renamed = status.startsWith("R") || status.startsWith("C");
    const filename = renamed ? fields[index++] : originalPath;
    const statusName = {
      A: "added",
      D: "removed",
      M: "modified",
      T: "modified",
      R: "renamed",
      C: "copied",
    }[status[0]];
    if (!filename || !originalPath || !statusName) {
      throw new Error("Invalid changed-file metadata in local review");
    }
    let content = "";
    if (statusName !== "removed") {
      if (head) {
        const entry = git(["--literal-pathspecs", "ls-tree", "-z", head, "--", filename]);
        // A submodule gitlink is not a blob and its commit may be unavailable locally.
        if (/^[0-7]{6} blob /.test(entry)) content = git(["show", `${head}:${filename}`]);
      } else {
        try {
          content = readFileSync(join(cwd, filename), "utf-8");
        } catch {
          // Gitlinks and files removed during collection may have no readable content.
        }
      }
    }
    files.push({
      filename,
      content,
      status: statusName,
      ...(renamed ? { previousFilename: originalPath } : {}),
      patch: "",
      // Git emits deletion and addition sections for a type change.
      patchCount: status[0] === "T" ? 2 : 1,
    });
  }

  const patch = git([...diffOptions, "--unified=3", ...revisions, "--"]);
  const sections = patch.split(/(?=^diff --git )/m).filter(Boolean);
  if (sections.length !== files.reduce((count, file) => count + file.patchCount, 0)) {
    throw new Error("Local review patch does not match changed-file metadata");
  }
  // Matching Git order preserves spaces and UTF-8 names without parsing quoted headers.
  return files.map(({ patchCount, ...file }) => ({
    ...file,
    patch: sections.splice(0, patchCount).join(""),
  }));
}
