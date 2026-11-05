import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { simpleGit } from "simple-git";
import type { CodeIssue } from "../agent/types";
import { validateReviewScope } from "../review/scope";
import { checkoutReviewCommit, prepareReviewSnapshot } from "./review-snapshot";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function directory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opendiff-snapshot-test-"));
  temporaryDirectories.push(dir);
  return dir;
}

async function repository() {
  const dir = await directory();
  const git = simpleGit(dir);
  await git.init(["--initial-branch=main"]);
  await git.addConfig("user.name", "Snapshot test");
  await git.addConfig("user.email", "snapshot@example.test");
  return { dir, git };
}

async function write(dir: string, filename: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, filename)), { recursive: true });
  await writeFile(join(dir, filename), content);
}

describe("review snapshots", () => {
  it("pins the head and compares with the common ancestor when the base advances", async () => {
    const { dir, git } = await repository();
    await write(dir, "src/a file.ts", "export const count = 1;\n");
    await git.add(".");
    await git.commit("Initial code");
    await git.checkoutLocalBranch("feature");
    await write(dir, "src/a file.ts", "export const count = 2;\n");
    await git.add(".");
    await git.commit("Change count");
    const head = (await git.revparse(["HEAD"])).trim();
    await git.checkout("main");
    await write(dir, "unrelated.ts", "export const unrelated = true;\n");
    await git.add(".");
    await git.commit("Advance base independently");
    const base = (await git.revparse(["HEAD"])).trim();

    const snapshot = await prepareReviewSnapshot(dir, git, {
      head: { sha: head, ref: "feature" },
      base: { sha: base, ref: "main" },
    });

    expect((await git.revparse(["HEAD"])).trim()).toBe(head);
    expect(snapshot.files.map((file) => file.filename)).toEqual(["src/a file.ts"]);
    expect(snapshot.files[0].patch).toContain("-export const count = 1;");
    expect(snapshot.files[0].patch).toContain("+export const count = 2;");
    expect(snapshot.files[0].additions).toBe(1);
    expect(snapshot.files[0].deletions).toBe(1);
    expect(await readFile(join(snapshot.baseDirectory, "src/a file.ts"), "utf8")).toBe(
      "export const count = 1;\n"
    );
    expect(await git.raw(["diff", "--name-only"])).toBe("");
  });

  it("keeps old paths and baseline contents for renamed and removed files", async () => {
    const { dir, git } = await repository();
    const original = "one\ntwo\nthree\nfour\nfive\nsix\n";
    await write(dir, "old.ts", original);
    await write(dir, "removed.ts", "validate(input);\n");
    await git.add(".");
    await git.commit("Initial code");
    const base = (await git.revparse(["HEAD"])).trim();
    await rename(join(dir, "old.ts"), join(dir, "new.ts"));
    await write(dir, "new.ts", original.replace("three", "changed"));
    await rm(join(dir, "removed.ts"));
    await write(dir, "added.ts", "export const added = true;\n");
    await git.add(".");
    await git.commit("Rename, remove, and add");
    const head = (await git.revparse(["HEAD"])).trim();

    const snapshot = await prepareReviewSnapshot(dir, git, {
      head: { sha: head, ref: "main" },
      base: { sha: base, ref: "main" },
    });
    const renamed = snapshot.files.find((file) => file.filename === "new.ts");
    expect(renamed?.status).toBe("renamed");
    expect(renamed?.previousFilename).toBe("old.ts");
    expect(renamed?.patch).toContain("-three\n+changed");
    expect(await readFile(join(snapshot.baseDirectory, "old.ts"), "utf8")).toBe(original);
    expect(snapshot.files.find((file) => file.filename === "removed.ts")?.patch).toContain(
      "-validate(input);"
    );
    expect(await readFile(join(snapshot.baseDirectory, "removed.ts"), "utf8")).toBe(
      "validate(input);\n"
    );
    expect(snapshot.files.find((file) => file.filename === "added.ts")?.status).toBe("added");
    await expect(readFile(join(snapshot.baseDirectory, "added.ts"))).rejects.toThrow();
  });

  for (const status of ["modified", "removed"] as const) {
    it(`reviews code alongside a ${status} submodule with unavailable commit objects`, async () => {
      const submodule = await repository();
      await write(submodule.dir, "dependency.ts", "before();\n");
      await submodule.git.add(".");
      await submodule.git.commit("Initial dependency");
      const oldCommit = (await submodule.git.revparse(["HEAD"])).trim();
      await write(submodule.dir, "dependency.ts", "after();\n");
      await submodule.git.add(".");
      await submodule.git.commit("Update dependency");
      const newCommit = (await submodule.git.revparse(["HEAD"])).trim();

      const { dir, git } = await repository();
      const submodulePath = "vendor/dependency";
      await write(dir, "code.ts", "before();\n");
      await git.add(".");
      await git.raw(["update-index", "--add", "--cacheinfo", "160000", oldCommit, submodulePath]);
      await git.commit("Initial code and gitlink");
      const base = (await git.revparse(["HEAD"])).trim();
      await write(dir, "code.ts", "after();\n");
      await git.add("code.ts");
      if (status === "modified") {
        await git.raw(["update-index", "--cacheinfo", "160000", newCommit, submodulePath]);
      } else {
        await git.raw(["update-index", "--force-remove", submodulePath]);
      }
      await git.commit("Change code and submodule");
      const head = (await git.revparse(["HEAD"])).trim();
      await expect(Promise.resolve(git.raw(["cat-file", "-t", oldCommit]))).rejects.toThrow();

      const snapshot = await prepareReviewSnapshot(dir, git, {
        head: { sha: head, ref: "main" },
        base: { sha: base, ref: "main" },
      });
      expect(snapshot.files).toHaveLength(2);
      const dependency = snapshot.files.find((file) => file.filename === submodulePath);
      expect(dependency?.status).toBe(status);
      expect(dependency?.patch).toContain(`-Subproject commit ${oldCommit}`);
      if (status === "modified") {
        expect(dependency?.patch).toContain(`+Subproject commit ${newCommit}`);
      }
      await expect(readFile(join(snapshot.baseDirectory, submodulePath))).rejects.toThrow();
      expect(snapshot.files.find((file) => file.filename === "code.ts")?.patch).toContain(
        "-before();\n+after();"
      );
      expect(await readFile(join(snapshot.baseDirectory, "code.ts"), "utf8")).toBe("before();\n");
    });
  }

  it("treats route filenames as literal paths instead of matching other changed files", async () => {
    const { dir, git } = await repository();
    for (const filename of ["src/[id].tsx", "src/i.tsx"]) {
      await write(dir, filename, "before();\n");
    }
    await git.add(".");
    await git.commit("Initial routes");
    const base = (await git.revparse(["HEAD"])).trim();
    for (const filename of ["src/[id].tsx", "src/i.tsx"]) {
      await write(dir, filename, "after();\n");
    }
    await git.add(".");
    await git.commit("Change both routes");
    const head = (await git.revparse(["HEAD"])).trim();

    const snapshot = await prepareReviewSnapshot(dir, git, {
      head: { sha: head, ref: "main" },
      base: { sha: base, ref: "main" },
    });
    const dynamicRoute = snapshot.files.find((file) => file.filename === "src/[id].tsx");
    expect(dynamicRoute?.patch).toContain("--- a/src/[id].tsx");
    expect(dynamicRoute?.patch).not.toContain("--- a/src/i.tsx");
    expect(dynamicRoute?.additions).toBe(1);
    expect(dynamicRoute?.deletions).toBe(1);
  });

  it("isolates patches when a file becomes a directory and preserves deletion anchors", async () => {
    const { dir, git } = await repository();
    await write(dir, "src/api.ts", "export const api = true;\n");
    await write(dir, "caller.ts", 'import { api } from "./src/api.ts";\n');
    await git.add(".");
    await git.commit("Initial API and caller");
    const base = (await git.revparse(["HEAD"])).trim();
    await rm(join(dir, "src/api.ts"));
    await write(dir, "src/api.ts/index.ts", "export function replacement() {}\n");
    await git.add(".");
    await git.commit("Replace API file with a directory");
    const head = (await git.revparse(["HEAD"])).trim();

    const snapshot = await prepareReviewSnapshot(dir, git, {
      head: { sha: head, ref: "main" },
      base: { sha: base, ref: "main" },
    });
    expect(snapshot.files).toHaveLength(2);
    const removed = snapshot.files.find((file) => file.filename === "src/api.ts");
    const added = snapshot.files.find((file) => file.filename === "src/api.ts/index.ts");
    expect(removed?.status).toBe("removed");
    expect(removed?.patch).toContain("-export const api = true;");
    expect(removed?.patch).not.toContain("src/api.ts/index.ts");
    expect(removed?.additions).toBe(0);
    expect(removed?.deletions).toBe(1);
    expect(added?.status).toBe("added");
    expect(added?.patch).toContain("+export function replacement() {}");
    expect(added?.patch).not.toContain("-export const api = true;");
    expect(added?.additions).toBe(1);
    expect(added?.deletions).toBe(0);
    expect(await readFile(join(snapshot.baseDirectory, "src/api.ts"), "utf8")).toBe(
      "export const api = true;\n"
    );
    const issue: CodeIssue = {
      type: "bug-risk",
      severity: "warning",
      file: "caller.ts",
      line: 1,
      message: "The explicit file import no longer resolves",
      scope: {
        file: "src/api.ts",
        line: 1,
        side: "LEFT",
        before: "The caller could import the API file explicitly.",
        after: "The API file is a directory, so the explicit import fails.",
      },
    };
    expect(validateReviewScope([issue], snapshot.files)).toEqual({
      accepted: [issue],
      rejected: [],
    });
  });

  it("keeps both type-change sections associated with their canonical file", async () => {
    const { dir, git } = await repository();
    await write(dir, "a.ts", "export const original = true;\n");
    await write(dir, "caller.ts", 'import { original } from "./a.ts";\n');
    await write(dir, "z.ts", "before();\n");
    await git.add(".");
    await git.commit("Initial files");
    const base = (await git.revparse(["HEAD"])).trim();
    await rm(join(dir, "a.ts"));
    await symlink("z.ts", join(dir, "a.ts"));
    await write(dir, "z.ts", "after();\n");
    await git.add(".");
    await git.commit("Replace a file with a symlink and modify another file");
    const head = (await git.revparse(["HEAD"])).trim();

    const snapshot = await prepareReviewSnapshot(dir, git, {
      head: { sha: head, ref: "main" },
      base: { sha: base, ref: "main" },
    });
    expect(snapshot.files).toHaveLength(2);
    const changedType = snapshot.files.find((file) => file.filename === "a.ts");
    expect(changedType?.patch).toContain("-export const original = true;");
    expect(changedType?.patch).toContain("+z.ts");
    expect(changedType?.patch).not.toContain("diff --git a/z.ts");
    const modified = snapshot.files.find((file) => file.filename === "z.ts");
    expect(modified?.patch).toContain("-before();\n+after();");
    expect(modified?.patch).not.toContain("diff --git a/a.ts");
    const issues: CodeIssue[] = (["LEFT", "RIGHT"] as const).map((side) => ({
      type: "bug-risk",
      severity: "warning",
      file: "caller.ts",
      line: 1,
      message: "Preserve the export used by the unchanged caller",
      scope: {
        file: "a.ts",
        line: 1,
        side,
        before: "The caller could import original from a.ts.",
        after: "The symlink targets z.ts, which does not export original.",
      },
    }));
    expect(validateReviewScope(issues, snapshot.files)).toEqual({
      accepted: issues,
      rejected: [],
    });
  });

  it("preserves rename-only metadata and the original baseline without inventing text changes", async () => {
    const { dir, git } = await repository();
    const original = "export const helper = () => true;\n";
    await write(dir, "src/helper.ts", original);
    await git.add(".");
    await git.commit("Initial helper");
    const base = (await git.revparse(["HEAD"])).trim();
    await rename(join(dir, "src/helper.ts"), join(dir, "src/moved.ts"));
    await git.add(".");
    await git.commit("Move helper without changing its code");
    const head = (await git.revparse(["HEAD"])).trim();

    const snapshot = await prepareReviewSnapshot(dir, git, {
      head: { sha: head, ref: "main" },
      base: { sha: base, ref: "main" },
    });
    expect(snapshot.files).toHaveLength(1);
    const moved = snapshot.files[0];
    expect(moved.filename).toBe("src/moved.ts");
    expect(moved.previousFilename).toBe("src/helper.ts");
    expect(moved.status).toBe("renamed");
    expect(moved.patch).toContain("rename from src/helper.ts\nrename to src/moved.ts");
    expect(moved.patch).not.toContain("@@");
    expect(moved.additions).toBe(0);
    expect(moved.deletions).toBe(0);
    expect(await readFile(join(snapshot.baseDirectory, "src/helper.ts"), "utf8")).toBe(original);
    expect(await readFile(join(dir, "src/moved.ts"), "utf8")).toBe(original);
  });

  it("fetches missing ancestry from a shallow clone before computing the PR diff", async () => {
    const source = await repository();
    await write(source.dir, "code.ts", "export const version = 1;\n");
    await source.git.add(".");
    await source.git.commit("Common ancestor");
    await source.git.checkoutLocalBranch("feature");
    await write(source.dir, "code.ts", "export const version = 2;\n");
    await source.git.add(".");
    await source.git.commit("Feature change");
    const head = (await source.git.revparse(["HEAD"])).trim();
    await source.git.checkout("main");
    await write(source.dir, "base-only.ts", "base();\n");
    await source.git.add(".");
    await source.git.commit("Base change");
    const base = (await source.git.revparse(["HEAD"])).trim();
    const clone = await directory();
    const git = simpleGit(clone);
    await git.clone(pathToFileURL(source.dir).href, ".", ["--depth=1", "--branch=feature"]);
    expect((await git.raw(["rev-parse", "--is-shallow-repository"])).trim()).toBe("true");

    const snapshot = await prepareReviewSnapshot(clone, git, {
      head: { sha: head, ref: "feature" },
      base: { sha: base, ref: "main" },
    });
    expect(snapshot.files.map((file) => file.filename)).toEqual(["code.ts"]);
    expect(await readFile(join(snapshot.baseDirectory, "code.ts"), "utf8")).toBe(
      "export const version = 1;\n"
    );
  });

  it("checks out the requested revision after its branch advances", async () => {
    const { dir, git } = await repository();
    await write(dir, "code.ts", "before();\n");
    await git.add(".");
    await git.commit("Reviewed revision");
    const reviewed = (await git.revparse(["HEAD"])).trim();
    await write(dir, "code.ts", "later();\n");
    await git.add(".");
    await git.commit("Later revision");
    await checkoutReviewCommit(git, reviewed);
    expect(await readFile(join(dir, "code.ts"), "utf8")).toBe("before();\n");
    expect((await git.revparse(["HEAD"])).trim()).toBe(reviewed);
  });

  it("rejects mutable refs rather than reviewing an unpinned branch", async () => {
    const { git } = await repository();
    await expect(checkoutReviewCommit(git, "main")).rejects.toThrow("exact commit SHA");
  });
});
