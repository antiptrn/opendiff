import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getDiffFiles } from "./diff";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function repository() {
  const directory = mkdtempSync(join(tmpdir(), "opendiff-extension-diff-"));
  temporaryDirectories.push(directory);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  git("init", "--initial-branch=main");
  git("config", "user.name", "Diff test");
  git("config", "user.email", "diff@example.test");
  const write = (filename: string, content: string) => {
    mkdirSync(dirname(join(directory, filename)), { recursive: true });
    writeFileSync(join(directory, filename), content);
  };
  const commit = (message: string) => {
    git("add", "--all");
    git("commit", "-m", message);
  };
  return { directory, git, write, commit };
}

describe("extension review diffs", () => {
  it("returns no files for an unchanged working tree", () => {
    const repo = repository();
    repo.write("code.ts", "before();\n");
    repo.commit("Initial code");
    expect(getDiffFiles(repo.directory, "working", "main")).toEqual([]);
  });

  it("keeps working scope limited to unstaged tracked changes", () => {
    const repo = repository();
    repo.write("code.ts", "before();\n");
    repo.write("staged.ts", "before();\n");
    repo.commit("Initial code");
    repo.write("staged.ts", "staged();\n");
    repo.git("add", "staged.ts");
    repo.write("code.ts", "after();\n");
    repo.write("untracked.ts", "untracked();\n");

    const files = getDiffFiles(repo.directory, "working", "main");
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("code.ts");
    expect(files[0].status).toBe("modified");
    expect(files[0].content).toBe("after();\n");
    expect(files[0].patch).toContain("-before();\n+after();");
  });

  it("carries pure rename metadata for a move that breaks relative imports", () => {
    const repo = repository();
    const content =
      'import { dependency } from "./dependency";\nexport const helper = dependency;\n';
    repo.write("src/helper.ts", content);
    repo.write("src/dependency.ts", "export const dependency = true;\n");
    repo.write("src/caller.ts", 'import { helper } from "./helper";\n');
    repo.commit("Initial helper and callers");
    repo.git("checkout", "-b", "feature");
    mkdirSync(join(repo.directory, "src/nested"));
    renameSync(join(repo.directory, "src/helper.ts"), join(repo.directory, "src/nested/helper.ts"));
    repo.commit("Move helper without updating relative imports");

    const files = getDiffFiles(repo.directory, "branch", "main");
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("src/nested/helper.ts");
    expect(files[0].previousFilename).toBe("src/helper.ts");
    expect(files[0].status).toBe("renamed");
    expect(files[0].content).toBe(content);
    expect(files[0].patch).toContain("rename from src/helper.ts\nrename to src/nested/helper.ts");
    expect(files[0].patch).not.toContain("@@");
  });

  it("preserves the original path and LEFT diff lines for a modified rename", () => {
    const repo = repository();
    repo.write("old.ts", "one();\ntwo();\nthree();\nfour();\nfive();\nsix();\n");
    repo.commit("Initial helper");
    repo.git("checkout", "-b", "feature");
    renameSync(join(repo.directory, "old.ts"), join(repo.directory, "new.ts"));
    repo.write("new.ts", "one();\ntwo();\nchanged();\nfour();\nfive();\nsix();\n");
    repo.commit("Rename and change helper");
    // Branch review content follows the committed head, not unrelated working changes.
    repo.write("new.ts", "unstaged();\n");

    const files = getDiffFiles(repo.directory, "branch", "main");
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe("renamed");
    expect(files[0].previousFilename).toBe("old.ts");
    expect(files[0].patch).toContain("--- a/old.ts\n+++ b/new.ts");
    expect(files[0].patch).toContain("-three();\n+changed();");
    expect(files[0].content).toContain("changed();");
    expect(files[0].content).not.toContain("unstaged();");
  });

  it("keeps spaces and UTF-8 names intact and associates literal route patches correctly", () => {
    const repo = repository();
    repo.write("src/old helper é.ts", "export const helper = true;\n");
    for (const filename of ["src/[id].tsx", "src/i.tsx"]) repo.write(filename, "before();\n");
    repo.commit("Initial routes and helper");
    repo.git("checkout", "-b", "feature");
    renameSync(
      join(repo.directory, "src/old helper é.ts"),
      join(repo.directory, "src/new helper å.ts")
    );
    for (const filename of ["src/[id].tsx", "src/i.tsx"]) repo.write(filename, "after();\n");
    repo.commit("Move helper and change routes");

    const files = getDiffFiles(repo.directory, "branch", "main");
    const helper = files.find((file) => file.filename === "src/new helper å.ts");
    expect(helper?.previousFilename).toBe("src/old helper é.ts");
    expect(helper?.status).toBe("renamed");
    expect(helper?.content).toBe("export const helper = true;\n");
    const route = files.find((file) => file.filename === "src/[id].tsx");
    expect(route?.patch).toContain("--- a/src/[id].tsx");
    expect(route?.patch).not.toContain("--- a/src/i.tsx");
    expect(files.find((file) => file.filename === "src/i.tsx")?.patch).not.toContain("[id]");
  });

  it("keeps deletion and descendant-addition patches separate during a file-to-directory move", () => {
    const repo = repository();
    repo.write("src/api.ts", "export const original = true;\n");
    repo.commit("Initial API");
    repo.git("checkout", "-b", "feature");
    rmSync(join(repo.directory, "src/api.ts"));
    repo.write("src/api.ts/index.ts", "export function replacement() {}\n");
    repo.commit("Replace file with directory");

    const files = getDiffFiles(repo.directory, "branch", "main");
    const removed = files.find((file) => file.filename === "src/api.ts");
    const added = files.find((file) => file.filename === "src/api.ts/index.ts");
    expect(removed?.status).toBe("removed");
    expect(removed?.content).toBe("");
    expect(removed?.patch).toContain("-export const original = true;");
    expect(removed?.patch).not.toContain("src/api.ts/index.ts");
    expect(added?.status).toBe("added");
    expect(added?.patch).not.toContain("-export const original = true;");
  });

  it("keeps both type-change sections associated with the changed file", () => {
    const repo = repository();
    repo.write("a.ts", "export const original = true;\n");
    repo.write("z.ts", "before();\n");
    repo.commit("Initial code");
    repo.git("checkout", "-b", "feature");
    rmSync(join(repo.directory, "a.ts"));
    symlinkSync("z.ts", join(repo.directory, "a.ts"));
    repo.write("z.ts", "after();\n");
    repo.commit("Change file type and another file");

    const files = getDiffFiles(repo.directory, "branch", "main");
    const changedType = files.find((file) => file.filename === "a.ts");
    expect(changedType?.status).toBe("modified");
    expect(changedType?.patch).toContain("-export const original = true;");
    expect(changedType?.patch).toContain("+z.ts");
    expect(changedType?.patch).not.toContain("diff --git a/z.ts");
    expect(files.find((file) => file.filename === "z.ts")?.patch).not.toContain(
      "diff --git a/a.ts"
    );
  });

  it("passes base branch names as arguments without executing shell text", () => {
    const repo = repository();
    repo.write("code.ts", "before();\n");
    repo.commit("Initial code");
    const base = "base;touch${IFS}unexpected";
    repo.git("branch", base);
    repo.git("checkout", "-b", "feature");
    repo.write("code.ts", "after();\n");
    repo.commit("Change code");
    expect(getDiffFiles(repo.directory, "branch", base).map((file) => file.filename)).toEqual([
      "code.ts",
    ]);
  });
});
