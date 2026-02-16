import { unlinkSync, writeFileSync } from "node:fs";
import { withRetry } from "./retry";

interface ApplyPatchAndPushOptions {
  tempDir: string;
  git: {
    raw: (args: string[]) => Promise<unknown>;
    add: (files: string | string[]) => Promise<unknown>;
    commit: (message: string) => Promise<{ commit: string }>;
    push: (remote: string, branch: string) => Promise<unknown>;
  };
  diff: string;
  commitMessage: string;
  branch: string;
}

export async function applyPatchAndPush(options: ApplyPatchAndPushOptions): Promise<string> {
  const { tempDir, git, diff, commitMessage, branch } = options;
  const diffPath = `${tempDir}/.fix.patch`;
  writeFileSync(diffPath, diff);
  await git.raw(["apply", "--allow-empty", diffPath]);
  unlinkSync(diffPath);

  await git.add(".");
  const commitResult = await git.commit(commitMessage);
  await withRetry(() => git.push("origin", branch), "git push");

  return commitResult.commit;
}
