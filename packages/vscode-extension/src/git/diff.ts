import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FilePayload } from "../types";

export type DiffScope = "working" | "branch";

export function getDiffFiles(cwd: string, scope: DiffScope, baseBranch: string): FilePayload[] {
  const diffCmd = scope === "branch" ? `git diff ${baseBranch}...HEAD` : "git diff";
  const nameCmd =
    scope === "branch" ? `git diff --name-only ${baseBranch}...HEAD` : "git diff --name-only";

  const patch = execSync(diffCmd, { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
  const names = execSync(nameCmd, { cwd, encoding: "utf-8" }).trim();

  if (!names) {
    return [];
  }

  const filenames = names.split("\n");

  // Split the unified diff into per-file patches
  const patchMap = splitPatch(patch);

  const files: FilePayload[] = [];
  for (const filename of filenames) {
    let content = "";
    try {
      content = readFileSync(join(cwd, filename), "utf-8");
    } catch {
      // File may have been deleted
    }

    files.push({
      filename,
      content,
      patch: patchMap.get(filename) || "",
    });
  }

  return files;
}

function splitPatch(patch: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = patch.split(/^diff --git /m);

  for (const part of parts) {
    if (!part.trim()) continue;
    // Extract filename from "a/path b/path" header
    const headerMatch = part.match(/^a\/(.+?) b\/(.+)/m);
    if (headerMatch) {
      const filename = headerMatch[2];
      map.set(filename, `diff --git ${part}`);
    }
  }

  return map;
}
