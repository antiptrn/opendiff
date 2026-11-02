import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { simpleGit } from "simple-git";
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
