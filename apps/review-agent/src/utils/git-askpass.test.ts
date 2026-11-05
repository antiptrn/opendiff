import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, open, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureAskPassScript } from "./git-askpass";

async function authenticate(scriptPath: string, token: string): Promise<void> {
  const child = Bun.spawn(["git", "-c", "credential.helper=", "credential", "fill"], {
    env: {
      ...process.env,
      GIT_ASKPASS: scriptPath,
      GIT_TERMINAL_PROMPT: "0",
      OPENDIFF_GIT_TOKEN: token,
    },
    stdin: new Blob(["protocol=https\nhost=github.com\n\n"]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout).toContain("username=x-access-token\n");
  expect(stdout).toContain(`password=${token}\n`);
}

describe("git askpass helper", () => {
  it("replaces the helper without modifying an already-open script", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opendiff-askpass-test-"));
    try {
      const binDir = join(rootDir, "bin");
      const scriptPath = join(binDir, "git-askpass.sh");
      const original = "#!/bin/sh\nprintf 'original helper\\n'\n";
      await mkdir(binDir);
      await writeFile(scriptPath, original, { mode: 0o700 });
      const handle = await open(scriptPath, "r");
      try {
        expect(await ensureAskPassScript(rootDir)).toBe(scriptPath);
        expect(await handle.readFile("utf8")).toBe(original);
        expect((await stat(scriptPath)).mode & 0o777).toBe(0o700);
        await authenticate(scriptPath, "replacement-token");
      } finally {
        await handle.close();
      }
      expect(await readdir(binDir)).toEqual(["git-askpass.sh"]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("supports concurrent preparation while Git authenticates with distinct tokens", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opendiff-askpass-test-"));
    try {
      const scriptPath = await ensureAskPassScript(rootDir);
      const results = await Promise.allSettled(
        Array.from({ length: 16 }, async (_, index) => {
          for (let round = 0; round < 3; round++) {
            await Promise.all([
              ensureAskPassScript(rootDir),
              authenticate(scriptPath, `token-${index}-${round}`),
            ]);
          }
        })
      );
      for (const result of results) {
        expect(result.status).toBe("fulfilled");
      }
      expect(await readdir(join(rootDir, "bin"))).toEqual(["git-askpass.sh"]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("cleans up the temporary script if publication fails", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "opendiff-askpass-test-"));
    try {
      const binDir = join(rootDir, "bin");
      // A directory at the destination forces rename to fail after writing the helper.
      await mkdir(join(binDir, "git-askpass.sh"), { recursive: true });
      await expect(ensureAskPassScript(rootDir)).rejects.toThrow();
      expect(await readdir(binDir)).toEqual(["git-askpass.sh"]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
