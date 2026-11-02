import type { CodeIssue, FileToReview } from "../agent/types";

interface ChangedLines {
  left: Set<number>;
  right: Set<number>;
}

function isRepositoryPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !/^[a-z]:/i.test(value) &&
    !value.includes("\\") &&
    Array.from(value).every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    }) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}

function isLine(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Parse one patch section, failing closed on truncated or inconsistent hunks. */
function sectionChangedLines(patch: string | undefined): ChangedLines | null {
  if (typeof patch !== "string" || !patch.trim()) return null;

  const result: ChangedLines = { left: new Set(), right: new Set() };
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining = 0;
  let newRemaining = 0;
  let hasHunk = false;
  let canHaveNoNewlineMarker = false;
  const lines = patch.split("\n");

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\r$/, "");
    const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/);
    if (hunk) {
      if (oldRemaining !== 0 || newRemaining !== 0) return null;
      const oldStart = Number(hunk[1]);
      const oldCount = hunk[2] === undefined ? 1 : Number(hunk[2]);
      const newStart = Number(hunk[3]);
      const newCount = hunk[4] === undefined ? 1 : Number(hunk[4]);
      const oldCursor = oldCount === 0 ? oldStart + 1 : oldStart;
      const newCursor = newCount === 0 ? newStart + 1 : newStart;
      if (
        ![oldStart, oldCount, newStart, newCount].every(Number.isSafeInteger) ||
        (oldCount > 0 && oldStart < 1) ||
        (newCount > 0 && newStart < 1) ||
        !Number.isSafeInteger(oldStart + oldCount) ||
        !Number.isSafeInteger(newStart + newCount) ||
        oldCount + newCount === 0 ||
        (hasHunk && (oldCursor < oldLine || newCursor < newLine))
      ) {
        return null;
      }
      oldLine = oldCursor;
      newLine = newCursor;
      oldRemaining = oldCount;
      newRemaining = newCount;
      hasHunk = true;
      canHaveNoNewlineMarker = false;
      continue;
    }

    if (line === "\\ No newline at end of file") {
      if (!canHaveNoNewlineMarker) return null;
      canHaveNoNewlineMarker = false;
      continue;
    }

    if (oldRemaining > 0 || newRemaining > 0) {
      if (line.startsWith(" ")) {
        if (oldRemaining < 1 || newRemaining < 1) return null;
        oldRemaining--;
        newRemaining--;
        oldLine++;
        newLine++;
      } else if (line.startsWith("-")) {
        if (oldRemaining < 1) return null;
        result.left.add(oldLine++);
        oldRemaining--;
      } else if (line.startsWith("+")) {
        if (newRemaining < 1) return null;
        result.right.add(newLine++);
        newRemaining--;
      } else {
        return null;
      }
      canHaveNoNewlineMarker = true;
      continue;
    }

    if (index === lines.length - 1 && line === "") continue;
    // A per-file patch may include standard git headers before its first hunk.
    if (
      !hasHunk &&
      /^(diff --git |index |--- |\+\+\+ |(?:old|new|deleted file|new file) mode |similarity index |rename (?:from|to) |copy (?:from|to) )/.test(
        line
      )
    ) {
      continue;
    }
    return null;
  }

  return hasHunk && oldRemaining === 0 && newRemaining === 0 ? result : null;
}

function matchesGitPath(value: string, path: string): boolean {
  // Git quotes special characters and, by default, non-ASCII UTF-8 bytes.
  const quoted = `"${Array.from(Buffer.from(path), (byte) => {
    if (byte === 34) return '\\"';
    if (byte === 92) return "\\\\";
    if (byte >= 127) return `\\${byte.toString(8).padStart(3, "0")}`;
    return String.fromCharCode(byte);
  }).join("")}"`;
  return value === path || value === quoted;
}

function changedLines(patch: string | undefined, filename: string): ChangedLines | null {
  if (typeof patch !== "string") return null;
  const sections = patch.split(/(?=^diff --git )/m).filter(Boolean);
  if (sections.length <= 1) return sectionChangedLines(patch);
  // A canonical type change is a deletion followed by an addition of the same
  // path. Parse them separately so the addition can restart its line counters.
  if (sections.length !== 2) return null;
  if (sections[0].split("\n", 1)[0] !== sections[1].split("\n", 1)[0]) return null;
  for (const [index, section] of sections.entries()) {
    const lines = section.split("\n").map((line) => line.replace(/\r$/, ""));
    const oldPath = lines.find((line) => line.startsWith("--- "))?.slice(4);
    const newPath = lines.find((line) => line.startsWith("+++ "))?.slice(4);
    if (
      !lines[0].startsWith("diff --git ") ||
      !lines.some((line) =>
        (index === 0 ? /^deleted file mode [0-7]{6}$/ : /^new file mode [0-7]{6}$/).test(line)
      ) ||
      oldPath === undefined ||
      newPath === undefined ||
      (index === 0
        ? !matchesGitPath(oldPath, `a/${filename}`) || newPath !== "/dev/null"
        : oldPath !== "/dev/null" || !matchesGitPath(newPath, `b/${filename}`))
    ) {
      return null;
    }
  }
  const deleted = sectionChangedLines(sections[0]);
  const added = sectionChangedLines(sections[1]);
  if (!deleted || !added || deleted.right.size !== 0 || added.left.size !== 0) return null;
  return { left: deleted.left, right: added.right };
}

/**
 * Check that findings have a real changed-code anchor and before/after evidence.
 * This establishes eligibility; the reviewer must still verify causal correctness.
 */
export function validateReviewScope(
  issues: CodeIssue[],
  files: FileToReview[]
): { accepted: CodeIssue[]; rejected: CodeIssue[] } {
  const anchors = new Map<string, Set<number>>();
  for (const file of files) {
    if (!isRepositoryPath(file.filename)) continue;
    const oldPath = file.previousFilename ?? file.filename;
    if (!isRepositoryPath(oldPath)) continue;
    // A rename can break imports without changing the file's contents.
    // Only canonical rename metadata supplies this file-level anchor.
    if (file.status === "renamed" && oldPath !== file.filename) {
      anchors.set(`FILE:${file.filename}`, new Set([1]));
    }
    const parsed = changedLines(file.patch, file.filename);
    if (!parsed) continue;
    anchors.set(`RIGHT:${file.filename}`, parsed.right);
    anchors.set(`LEFT:${oldPath}`, parsed.left);
  }

  const accepted: CodeIssue[] = [];
  const rejected: CodeIssue[] = [];
  for (const issue of issues) {
    const scope = issue?.scope;
    const eligible =
      issue !== null &&
      typeof issue === "object" &&
      isRepositoryPath(issue.file) &&
      isLine(issue.line) &&
      (issue.endLine === undefined || (isLine(issue.endLine) && issue.endLine >= issue.line)) &&
      scope !== null &&
      typeof scope === "object" &&
      isRepositoryPath(scope.file) &&
      isLine(scope.line) &&
      (scope.side === "LEFT" || scope.side === "RIGHT" || scope.side === "FILE") &&
      typeof scope.before === "string" &&
      scope.before.trim().length > 0 &&
      typeof scope.after === "string" &&
      scope.after.trim().length > 0 &&
      scope.before.trim() !== scope.after.trim() &&
      anchors.get(`${scope.side}:${scope.file}`)?.has(scope.line) === true;
    (eligible ? accepted : rejected).push(issue);
  }

  return { accepted, rejected };
}
